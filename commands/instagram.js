const axios = require('axios');
const cheerio = require('cheerio');

// Store processed message IDs
const processedMessages = new Set();

// Multiple scraper functions for fallback
async function tryMultipleScrapers(url) {
    const scrapers = [
        scrapeWithApi1,
        scrapeWithApi2,
        scrapeWithApi3
    ];
    
    for (let i = 0; i < scrapers.length; i++) {
        try {
            const result = await scrapers[i](url);
            if (result && result.length > 0) {
                return result;
            }
        } catch (error) {
            console.log(`Scraper ${i + 1} failed:`, error.message);
            continue;
        }
    }
    
    return null;
}

// Scraper 1: Using public API
async function scrapeWithApi1(url) {
    try {
        const apiUrl = `https://api.downloadgram.com/download?url=${encodeURIComponent(url)}`;
        const response = await axios.get(apiUrl, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (response.data && response.data.media) {
            return response.data.media.map(item => ({
                url: item.url,
                type: item.type || 'video'
            }));
        }
    } catch (error) {
        throw error;
    }
}

// Scraper 2: Alternative API
async function scrapeWithApi2(url) {
    try {
        const response = await axios.get(`https://instagram-downloader-download-instagram-videos-stories.p.rapidapi.com/index`, {
            params: { url },
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'X-RapidAPI-Key': 'your-rapidapi-key', // Get from rapidapi.com
                'X-RapidAPI-Host': 'instagram-downloader-download-instagram-videos-stories.p.rapidapi.com'
            },
            timeout: 15000
        });
        
        if (response.data && response.data.media) {
            return response.data.media;
        }
    } catch (error) {
        throw error;
    }
}

// Scraper 3: Direct scraping (fallback)
async function scrapeWithApi3(url) {
    try {
        // Extract shortcode from URL
        const shortcodeMatch = url.match(/\/(p|reel|tv)\/([^/?]+)/);
        if (!shortcodeMatch) return null;
        
        const shortcode = shortcodeMatch[2];
        const graphqlUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
        
        const response = await axios.get(graphqlUrl, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0'
            }
        });
        
        if (response.data) {
            const media = [];
            const data = response.data;
            
            // Handle different response formats
            if (data.items && data.items[0]) {
                const item = data.items[0];
                
                // Handle carousel posts
                if (item.carousel_media) {
                    item.carousel_media.forEach(mediaItem => {
                        if (mediaItem.video_versions && mediaItem.video_versions[0]) {
                            media.push({
                                url: mediaItem.video_versions[0].url,
                                type: 'video'
                            });
                        } else if (mediaItem.image_versions2 && mediaItem.image_versions2.candidates) {
                            media.push({
                                url: mediaItem.image_versions2.candidates[0].url,
                                type: 'image'
                            });
                        }
                    });
                }
                // Handle single video
                else if (item.video_versions && item.video_versions[0]) {
                    media.push({
                        url: item.video_versions[0].url,
                        type: 'video'
                    });
                }
                // Handle single image
                else if (item.image_versions2 && item.image_versions2.candidates) {
                    media.push({
                        url: item.image_versions2.candidates[0].url,
                        type: 'image'
                    });
                }
            }
            
            return media.length > 0 ? media : null;
        }
    } catch (error) {
        throw error;
    }
}

// Extract URL from command
function extractInstagramUrl(text) {
    // Remove command prefix and trim
    const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
    return urlMatch ? urlMatch[0].trim() : null;
}

// Validate Instagram URL
function isValidInstagramUrl(url) {
    if (!url) return false;
    
    const instagramPatterns = [
        /^https?:\/\/(www\.)?instagram\.com\/(p|reel|tv|stories)\/[^/]+\/?/,
        /^https?:\/\/(www\.)?instagr\.am\/(p|reel|tv|stories)\/[^/]+\/?/
    ];
    
    return instagramPatterns.some(pattern => pattern.test(url));
}

async function instagramCommand(sock, chatId, message) {
    try {
        // Check for duplicates
        if (processedMessages.has(message.key.id)) {
            return;
        }
        processedMessages.add(message.key.id);
        
        // Cleanup after 5 minutes
        setTimeout(() => {
            processedMessages.delete(message.key.id);
        }, 5 * 60 * 1000);

        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        
        if (!text) {
            return await sock.sendMessage(chatId, { 
                text: "❌ Please provide an Instagram URL.\nExample: .ig https://instagram.com/p/..."
            });
        }

        // Extract URL from command
        const instagramUrl = extractInstagramUrl(text);
        
        if (!instagramUrl || !isValidInstagramUrl(instagramUrl)) {
            return await sock.sendMessage(chatId, { 
                text: "❌ Invalid Instagram URL. Please provide a valid Instagram post, reel, or story link."
            });
        }

        await sock.sendMessage(chatId, {
            react: { text: '🔄', key: message.key }
        });

        // Try multiple scrapers
        let mediaData = null;
        
        try {
            // First try: Direct scraping method
            mediaData = await scrapeWithApi3(instagramUrl);
        } catch (error) {
            console.log('Direct scraping failed:', error.message);
        }
        
        // Fallback to alternative methods
        if (!mediaData || mediaData.length === 0) {
            mediaData = await tryMultipleScrapers(instagramUrl);
        }

        if (!mediaData || mediaData.length === 0) {
            return await sock.sendMessage(chatId, { 
                text: `❌ Failed to download Instagram media.\n\nPossible reasons:\n• The post is private\n• Account is private\n• Link is invalid\n• Instagram has blocked the scraper\n\nTry:\n• Using a public post\n• Checking the URL`
            });
        }

        // Send media with better error handling
        let successCount = 0;
        
        for (let i = 0; i < mediaData.length; i++) {
            try {
                const media = mediaData[i];
                
                if (media.type === 'video') {
                    await sock.sendMessage(chatId, {
                        video: { url: media.url },
                        mimetype: "video/mp4",
                        caption: i === 0 ? "📱 *Instagram Download*\n\n⬇️ Downloaded by 404-XMD" : ""
                    });
                } else {
                    await sock.sendMessage(chatId, {
                        image: { url: media.url },
                        caption: i === 0 ? "📱 *Instagram Download*\n\n⬇️ Downloaded by 404-XMD" : ""
                    });
                }
                
                successCount++;
                
                // Delay between sends
                if (i < mediaData.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
                
            } catch (sendError) {
                console.error(`Failed to send media ${i + 1}:`, sendError.message);
                // Continue with next media
            }
        }

        // Success message
        if (successCount > 0) {
            await sock.sendMessage(chatId, {
                text: `✅ Successfully downloaded ${successCount} media item(s) from Instagram.`
            });
        } else {
            await sock.sendMessage(chatId, {
                text: "❌ Failed to send any media items. They might be too large or blocked by WhatsApp."
            });
        }

    } catch (error) {
        console.error('Instagram command error:', error);
        await sock.sendMessage(chatId, { 
            text: `❌ Error: ${error.message}\n\nTry:\n• Using .ig2 command (alternative method)\n• Making sure the post is public\n• Using a different Instagram link`
        });
    }
}

module.exports = instagramCommand;