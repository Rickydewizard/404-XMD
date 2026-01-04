const axios = require("axios");
const FormData = require('form-data');
const fs = require('fs');
const path = require("path");

module.exports = async (sock, chatId, message, rawText) => {
    try {
        const quotedMsg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        
        if (!quotedMsg) {
            await sock.sendMessage(chatId, {
                text: "📸 *Background Remover*\n\nPlease reply to an image to remove its background\n\n*Example:* .rmbg (reply to photo)\n.removebg (reply to image)\n\n*Supported formats:* JPEG, PNG\n*Best results:* Clear subject, good contrast"
            }, { quoted: message });
            return;
        }

        const isImage = !!quotedMsg.imageMessage;
        
        if (!isImage) {
            await sock.sendMessage(chatId, {
                text: "❌ Please reply to an image file (JPEG or PNG)"
            }, { quoted: message });
            return;
        }

        // Send processing reaction
        await sock.sendMessage(chatId, { 
            react: { text: '⏳', key: message.key } 
        });

        // Send initial status
        const statusMsg = await sock.sendMessage(chatId, {
            text: "🔄 *Processing your image...*\n\n📥 Downloading image...",
            quoted: message
        });

        // Download the image
        const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
        const media = quotedMsg.imageMessage;
        
        const stream = await downloadContentFromMessage(media, 'image');
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(chunk);
        }
        const imageBuffer = Buffer.concat(chunks);

        // Check image size
        if (imageBuffer.length > 5 * 1024 * 1024) { // 5MB limit
            await sock.sendMessage(chatId, {
                text: "❌ Image too large! Maximum size is 5MB.\n\nPlease use a smaller image or compress it first."
            }, { quoted: message });
            return;
        }

        // Update status
        await sock.sendMessage(chatId, {
            text: "🔄 *Processing your image...*\n\n✅ Image downloaded\n\n📤 Uploading for processing...",
            quoted: statusMsg
        });

        // Remove background
        const resultBuffer = await removeBackground(imageBuffer);

        // Update status
        await sock.sendMessage(chatId, {
            text: "🔄 *Processing your image...*\n\n✅ Image downloaded\n✅ Upload complete\n\n🎨 Removing background...",
            quoted: statusMsg
        });

        // Check if result is valid
        if (!resultBuffer || resultBuffer.length === 0) {
            throw new Error("Empty result from background removal");
        }

        // Check if it's still the original image (fallback failed)
        if (resultBuffer.equals(imageBuffer)) {
            await sock.sendMessage(chatId, {
                text: "⚠️ *Background Removal Failed*\n\nCould not process this image.\n\n*Tips:*\n• Use images with clear subjects\n• Avoid busy backgrounds\n• Ensure good lighting\n• Use high contrast images",
                quoted: message
            });
            return;
        }

        // Send the result
        await sock.sendMessage(chatId, {
            image: resultBuffer,
            caption: "✅ *Background removed successfully!*\n\n✨ *Powered by 404-XMD*\n\n📁 *Formats available:*\n• PNG (transparent)\n• JPEG (white background)\n\n💡 *Tip:* Save as PNG for best quality!",
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true
            }
        }, { quoted: message });

        // Success reaction
        await sock.sendMessage(chatId, { 
            react: { text: '✅', key: message.key } 
        });

    } catch (error) {
        console.error('Background removal error:', error);
        
        let errorMsg = "❌ Failed to remove background.";
        if (error.message.includes("timeout") || error.message.includes("ECONNABORTED")) {
            errorMsg = "⏰ Request timeout. Service might be busy. Try again in a moment.";
        } else if (error.message.includes("network") || error.message.includes("ENOTFOUND")) {
            errorMsg = "🌐 Network error. Check your connection and try again.";
        } else if (error.message.includes("API") || error.message.includes("service")) {
            errorMsg = "🔧 Background removal service is currently down. Please try again later.";
        } else if (error.message.includes("detect")) {
            errorMsg = "❌ Could not detect subject in image.\n\n*Try:*\n• Clearer image\n• Better lighting\n• Simple background";
        }

        await sock.sendMessage(chatId, {
            text: `${errorMsg}\n\nError: ${error.message}\n\n*Alternative:*\nUse online tools like remove.bg or photoroom.com`
        }, { quoted: message });

        await sock.sendMessage(chatId, { 
            react: { text: '❌', key: message.key } 
        });
    }
};

// Main background removal function
async function removeBackground(imageBuffer) {
    // Try multiple APIs in sequence
    const apis = [
        tryApi1,  // Primary API
        tryApi2,  // Secondary API  
        tryApi3,  // Tertiary API
        tryApi4   // Fallback API
    ];

    for (let i = 0; i < apis.length; i++) {
        try {
            console.log(`Trying API ${i + 1}...`);
            const result = await apis[i](imageBuffer);
            if (result && result.length > 1000) { // Ensure it's a valid image
                console.log(`✅ API ${i + 1} succeeded`);
                return result;
            }
        } catch (error) {
            console.log(`API ${i + 1} failed:`, error.message);
            continue;
        }
    }
    
    // If all APIs fail, return original buffer
    console.log('All APIs failed, returning original image');
    return imageBuffer;
}

// API 1: Remove.bg API (requires API key - get free one from remove.bg)
async function tryApi1(buffer) {
    try {
        // Get a free API key from remove.bg (100 free/month)
        const API_KEY = 'YOUR_REMOVE_BG_API_KEY'; // Get from https://www.remove.bg/api
        
        const form = new FormData();
        form.append('image_file', buffer, { 
            filename: 'image.jpg',
            contentType: 'image/jpeg'
        });
        form.append('size', 'auto');
        
        const response = await axios.post('https://api.remove.bg/v1.0/removebg', form, {
            headers: {
                ...form.getHeaders(),
                'X-Api-Key': API_KEY,
            },
            responseType: 'arraybuffer',
            timeout: 45000,
            maxContentLength: 10 * 1024 * 1024 // 10MB
        });

        if (response.data && response.data.length > 0) {
            return Buffer.from(response.data);
        }
        throw new Error('No data returned');
    } catch (error) {
        throw error;
    }
}

// API 2: Alternative free API
async function tryApi2(buffer) {
    try {
        // Upload to free image host first
        const imageUrl = await uploadToImgur(buffer);
        
        const apiUrl = `https://apis.davidcyriltech.my.id/removebg?url=${encodeURIComponent(imageUrl)}`;
        const response = await axios.get(apiUrl, { 
            responseType: "arraybuffer",
            timeout: 30000,
            headers: {
                'Accept': 'image/*',
                'User-Agent': 'Mozilla/5.0'
            }
        });

        return Buffer.from(response.data);
    } catch (error) {
        throw error;
    }
}

// API 3: Another free service
async function tryApi3(buffer) {
    try {
        const form = new FormData();
        form.append('image', buffer, { filename: 'image.jpg' });
        
        const response = await axios.post('https://clipdrop-api.co/remove-background/v1', form, {
            headers: {
                ...form.getHeaders(),
                'x-api-key': 'free', // Note: Might need actual key
            },
            responseType: 'arraybuffer',
            timeout: 30000
        });

        return Buffer.from(response.data);
    } catch (error) {
        throw error;
    }
}

// API 4: Local Python script fallback (requires python)
async function tryApi4(buffer) {
    try {
        // Save buffer to temp file
        const tempInput = path.join(__dirname, 'temp_input.jpg');
        const tempOutput = path.join(__dirname, 'temp_output.png');
        
        fs.writeFileSync(tempInput, buffer);
        
        // Use rembg CLI tool (requires: pip install rembg)
        const { execSync } = require('child_process');
        execSync(`rembg i ${tempInput} ${tempOutput}`);
        
        const resultBuffer = fs.readFileSync(tempOutput);
        
        // Clean up
        fs.unlinkSync(tempInput);
        fs.unlinkSync(tempOutput);
        
        return resultBuffer;
    } catch (error) {
        throw error;
    }
}

// Upload to Imgur (more reliable than telegraph)
async function uploadToImgur(buffer) {
    try {
        const form = new FormData();
        form.append('image', buffer.toString('base64'));
        
        const response = await axios.post('https://api.imgur.com/3/image', form, {
            headers: {
                ...form.getHeaders(),
                'Authorization': 'Client-ID YOUR_IMGUR_CLIENT_ID' // Get from imgur.com
            },
            timeout: 15000
        });

        if (response.data?.data?.link) {
            return response.data.data.link;
        }
        throw new Error('Imgur upload failed');
    } catch (error) {
        // Fallback to telegraph
        return await uploadToTelegraph(buffer);
    }
}

// Upload to Telegraph
async function uploadToTelegraph(buffer) {
    try {
        const form = new FormData();
        form.append('file', buffer, { filename: 'image.jpg' });
        
        const response = await axios.post('https://telegra.ph/upload', form, {
            headers: form.getHeaders(),
            timeout: 15000
        });

        if (response.data && response.data[0] && response.data[0].src) {
            return 'https://telegra.ph' + response.data[0].src;
        }
        throw new Error('Telegraph upload failed');
    } catch (error) {
        // Final fallback: Base64
        return `data:image/jpeg;base64,${buffer.toString('base64')}`;
    }
}