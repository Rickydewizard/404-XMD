const axios = require('axios');
const { sleep } = require('../lib/myfunc');

async function pairCommand(sock, chatId, message, q) {
    try {
        // Extract message text properly
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        const command = text.split(' ')[0];
        const userInput = text.slice(command.length).trim();
        
        // Use provided q OR extract from message
        const query = q || userInput;
        
        if (!query) {
            return await sock.sendMessage(chatId, {
                text: "📱 *WhatsApp Pairing*\n\nPlease provide a valid WhatsApp number\n\n*Example:*\n.pair 254769769295\n.pair +254769769295\n\n*Format:*\nCountry Code + Number",
                quoted: message
            });
        }

        // Clean and validate numbers
        const numbers = query.split(',')
            .map(num => {
                // Remove all non-numeric characters except +
                let cleaned = num.replace(/[^0-9+]/g, '');
                // If starts with +, keep it, otherwise ensure it's just numbers
                if (cleaned.startsWith('+')) {
                    cleaned = '+' + cleaned.replace(/[^0-9]/g, '');
                } else {
                    cleaned = cleaned.replace(/[^0-9]/g, '');
                }
                return cleaned;
            })
            .filter(num => {
                // Validate: at least 8 digits, max 15 digits
                const digits = num.replace(/[^0-9]/g, '');
                return digits.length >= 8 && digits.length <= 15;
            });

        if (numbers.length === 0) {
            return await sock.sendMessage(chatId, {
                text: "❌ *Invalid number format!*\n\nPlease provide a valid WhatsApp number.\n\n*Examples:*\n• 254769769295\n• +254769769295\n• 254769769295,254712345678",
                quoted: message
            });
        }

        // Limit to 3 numbers at once to avoid spam
        const numbersToProcess = numbers.slice(0, 3);
        
        let results = [];
        
        for (const number of numbersToProcess) {
            try {
                // Format for WhatsApp check
                const cleanNumber = number.replace(/[^0-9]/g, '');
                const whatsappID = cleanNumber + '@s.whatsapp.net';
                
                // Check if number exists on WhatsApp
                const whatsappCheck = await sock.onWhatsApp(whatsappID);
                
                if (!whatsappCheck[0]?.exists) {
                    results.push(`❌ ${number}: Not registered on WhatsApp`);
                    continue;
                }
                
                await sock.sendMessage(chatId, {
                    react: { text: '🔄', key: message.key }
                });
                
                // FIXED: Correct API URL (removed double .onrender)
                const apiUrl = `https://four04-the-goat.onrender.com/code?number=${cleanNumber}`;
                
                // Get pairing code with timeout
                const response = await axios.get(apiUrl, {
                    timeout: 30000, // 30 second timeout
                    headers: {
                        'User-Agent': 'Mozilla/5.0',
                        'Accept': 'application/json'
                    }
                });
                
                if (response.data && response.data.code) {
                    const code = response.data.code;
                    
                    if (code === "Service Unavailable" || code.includes("Error") || code.includes("Failed")) {
                        results.push(`❌ ${number}: Service temporarily unavailable`);
                        continue;
                    }
                    
                    // Send success message
                    await sock.sendMessage(chatId, {
                        text: `✅ *Pairing Code Generated*\n\n📱 *Number:* ${number}\n🔐 *Code:* ${code}\n\n💡 *Instructions:*\n1. Open WhatsApp on target device\n2. Go to Settings > Linked Devices\n3. Enter this code within 20 seconds`,
                        quoted: message
                    });
                    
                    results.push(`✅ ${number}: Code sent`);
                    
                } else {
                    results.push(`❌ ${number}: Failed to get code`);
                }
                
                // Wait between requests to avoid rate limiting
                if (numbersToProcess.length > 1) {
                    await sleep(2000);
                }
                
            } catch (error) {
                console.error(`Error for ${number}:`, error.message);
                
                if (error.code === 'ECONNABORTED') {
                    results.push(`❌ ${number}: Request timeout (server busy)`);
                } else if (error.response?.status === 404) {
                    results.push(`❌ ${number}: API endpoint not found`);
                } else if (error.response?.status === 500) {
                    results.push(`❌ ${number}: Server error`);
                } else {
                    results.push(`❌ ${number}: ${error.message}`);
                }
                
                // Continue with next number even if one fails
                continue;
            }
        }
        
        // Send summary if multiple numbers
        if (numbersToProcess.length > 1) {
            const summary = `📊 *Pairing Summary*\n\n${results.join('\n')}`;
            await sock.sendMessage(chatId, {
                text: summary,
                quoted: message
            });
        }
        
        await sock.sendMessage(chatId, {
            react: { text: '✅', key: message.key }
        });
        
    } catch (error) {
        console.error('Pair command error:', error);
        
        // Send appropriate error message
        let errorMessage = "❌ An unexpected error occurred.";
        
        if (error.message.includes('timeout')) {
            errorMessage = "⏰ Request timeout. The server might be busy. Try again later.";
        } else if (error.message.includes('Network Error')) {
            errorMessage = "🌐 Network error. Check your internet connection.";
        } else if (error.message.includes('ENOTFOUND')) {
            errorMessage = "🔧 API server is currently down. Try again later.";
        }
        
        await sock.sendMessage(chatId, {
            text: `${errorMessage}\n\nError: ${error.message}`,
            quoted: message
        });
        
        await sock.sendMessage(chatId, {
            react: { text: '❌', key: message.key }
        });
    }
}

module.exports = pairCommand;