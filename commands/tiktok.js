const axios = require('axios');

// Store processed message IDs
const processedMessages = new Set();

// Helper function to extract URL from command
function extractTikTokUrl(text) {
    if (!text) return null;
    
    // Match URL patterns in the message
    const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
    return urlMatch ? urlMatch[0].trim() : null;
}

// Validate TikTok URL
function isValidTikTokUrl(url) {
    if (!url) return false;
    
    const tiktokPatterns = [
        /^https?:\/\/(www\.)?tiktok\.com\/@[^/]+\/video\/\d+/,
        /^https?:\/\/(www\.)?tiktok\.com\/t\/[a-zA-Z0-9]+/,
        /^https?:\/\/vm\.tiktok\.com\/[a-zA-Z0-9]+/,
        /^https?:\/\/vt\.tiktok\.com\/[a-zA-Z0-9]+/
    ];
    
    return tiktokPatterns.some(pattern => pattern.test(url));
}

// Function to resolve short URLs
async function resolveShortUrl(url) {
    try {
        const response = await axios.head(url, {
            timeout: 10000,
            maxRedirects: 5,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (response.request?.res?.responseUrl) {
            return response.request.res.responseUrl;
        }
    } catch (error) {
        console.log('URL resolution failed:', error.message);
    }
    return url;
}

// Multiple API endpoints for fallback
async function tryMultipleApis(url) {
    const apis = [
        {
            name: 'API 1',
            url: `https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(url)}`,
            parser: (data) => {
                if (data?.status === true && data?.data) {
                    if (Array.isArray(data.data.urls) && data.data.urls.length > 0) {
                        return {
                            video: data.data.urls[0],
                            audio: data.data.audio,
                            title: data.data.metadata?.title || "TikTok Video",
                            author: data.data.metadata?.author || null
                        };
                    }
                    if (data.data.video_url) {
                        return {
                            video: data.data.video_url,
                            audio: data.data.audio_url || data.data.audio,
                            title: data.data.metadata?.title || "TikTok Video",
                            author: data.data.metadata?.author || null
                        };
                    }
                }
                return null;
            }
        },
        {
            name: 'API 2',
            url: `https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`,
            parser: (data) => {
                if (data?.videoUrl) {
                    return {
                        video: data.videoUrl,
                        audio: data.musicUrl,
                        title: data.title || "TikTok Video",
                        author: data.author || null
                    };
                }
                return null;
            }
        },
        {
            name: 'API 3',
            url: `https://api.tikwm.com/api/?url=${encodeURIComponent(url)}`,
            parser: (data) => {
                if (data?.data) {
                    return {
                        video: data.data.play || data.data.hdplay || data.data.wmplay,
                        audio: data.data.music,
                        title: data.data.title || "TikTok Video",
                        author: data.data.author || null
                    };
                }
                return null;
            }
        },
        {
            name: 'API 4',
            url: `https://tikwm.com/api/?url=${encodeURIComponent(url)}`,
            parser: (data) => {
                if (data?.data) {
                    return {
                        video: data.data.play || data.data.hdplay || data.data.wmplay,
                        audio: data.data.music,
                        title: data.data.title || "TikTok Video",
                        author: data.data.author || null
                    };
                }
                return null;
            }
        }
    ];

    for (const api of apis) {
        try {
            console.log(`Trying ${api.name}...`);
            const response = await axios.get(api.url, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json'
                }
            });

            if (response.data) {
                const result = api.parser(response.data);
                if (result && result.video) {
                    console.log(`Success with ${api.name}`);
                    return result;
                }
            }
        } catch (error) {
            console.log(`${api.name} failed:`, error.message);
            continue;
        }
    }
    
    return null;
}

async function tiktokCommand(sock, chatId, message) {
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
                text: "❌ Please provide a TikTok URL.\nExample: .tiktok https://tiktok.com/@user/video/123456789"
            });
        }

        // Extract URL
        const tiktokUrl = extractTikTokUrl(text);
        
        if (!tiktokUrl) {
            return await sock.sendMessage(chatId, { 
                text: "❌ No URL found in your message. Please include a TikTok link."
            });
        }
        
        if (!isValidTikTokUrl(tiktokUrl)) {
            return await sock.sendMessage(chatId, { 
                text: "❌ Invalid TikTok URL format.\n\nSupported formats:\n• https://tiktok.com/@user/video/123\n• https://vm.tiktok.com/ABC123\n• https://tiktok.com/t/ABC123"
            });
        }

        // Send loading reaction
        await sock.sendMessage(chatId, {
            react: { text: '🔄', key: message.key }
        });

        // Resolve short URLs first
        const resolvedUrl = await resolveShortUrl(tiktokUrl);
        
        // Try multiple APIs
        const videoData = await tryMultipleApis(resolvedUrl);
        
        if (!videoData || !videoData.video) {
            return await sock.sendMessage(chatId, { 
                text: `❌ Failed to download TikTok video.\n\nPossible reasons:\n• Video is private/removed\n• Account is private\n• All APIs are down\n• Region restriction\n\nTry:\n• Using a public video\n• Copying direct video URL\n• Using command: .tt [url] (alternative)`
            }, { quoted: message });
        }

        // Send the video
        const caption = videoData.title ? 
            `📱 *TikTok Video*\n\n🎬 *Title:* ${videoData.title}\n${videoData.author ? `👤 *Author:* ${videoData.author}\n` : ''}\n⬇️ *Downloaded by 404-XMD*` : 
            '⬇️ *Downloaded by 404-XMD*';

        try {
            // Method 1: Direct URL send (fastest)
            await sock.sendMessage(chatId, {
                video: { url: videoData.video },
                mimetype: "video/mp4",
                caption: caption
            }, { quoted: message });
            
        } catch (urlError) {
            console.log('URL method failed, trying buffer method:', urlError.message);
            
            try {
                // Method 2: Download to buffer
                const videoResponse = await axios({
                    method: 'GET',
                    url: videoData.video,
                    responseType: 'arraybuffer',
                    timeout: 60000,
                    maxContentLength: 50 * 1024 * 1024, // 50MB limit
                    headers: {
                        'User-Agent': 'Mozilla/5.0',
                        'Referer': 'https://www.tiktok.com/'
                    }
                });
                
                await sock.sendMessage(chatId, {
                    video: Buffer.from(videoResponse.data),
                    mimetype: "video/mp4",
                    caption: caption
                }, { quoted: message });
                
            } catch (bufferError) {
                console.log('Buffer method failed:', bufferError.message);
                
                // Method 3: Send as document
                try {
                    await sock.sendMessage(chatId, {
                        document: { url: videoData.video },
                        mimetype: "video/mp4",
                        fileName: `tiktok_${Date.now()}.mp4`,
                        caption: caption
                    }, { quoted: message });
                    
                } catch (docError) {
                    console.log('Document method failed:', docError.message);
                    
                    // Send the direct link as last resort
                    await sock.sendMessage(chatId, {
                        text: `❌ Could not send video directly.\n\n*Direct Download Link:*\n${videoData.video}\n\n*Title:* ${videoData.title || 'N/A'}\n\nCopy this link and download manually.`
                    }, { quoted: message });
                }
            }
        }

        // Send audio separately if available
        if (videoData.audio) {
            try {
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                await sock.sendMessage(chatId, {
                    audio: { url: videoData.audio },
                    mimetype: "audio/mpeg",
                    caption: "🎵 TikTok Audio"
                });
            } catch (audioError) {
                console.log('Failed to send audio:', audioError.message);
            }
        }

    } catch (error) {
        console.error('TikTok command error:', error);
        await sock.sendMessage(chatId, { 
            text: `❌ Error: ${error.message}\n\nTry:\n• Using .tt command (alternative)\n• Making sure video is public\n• Using a different TikTok link`
        }, { quoted: message });
    }
}

module.exports = tiktokCommand;