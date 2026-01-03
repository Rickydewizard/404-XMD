/**
 * 404 XMD - Text Auto Reply Command
 * Separate from voice auto-replies
 */

const fs = require('fs');
const path = require('path');
const isOwnerOrSudo = require('../lib/isOwner');

// Path to store the configuration
const configPath = path.join(__dirname, '..', 'data', 'autoreply.json');

// Default autoreply message
const DEFAULT_MESSAGE = "Hello! I'm currently away. I'll get back to you soon.";

// Initialize configuration file
function initConfig() {
    if (!fs.existsSync(configPath)) {
        const defaultConfig = {
            enabled: false,
            message: DEFAULT_MESSAGE,
            lastUpdated: Date.now()
        };
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        return defaultConfig;
    }
    return JSON.parse(fs.readFileSync(configPath));
}

// Save configuration
function saveConfig(config) {
    config.lastUpdated = Date.now();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// Show typing indicator
async function showTypingIndicator(sock, chatId) {
    try {
        await sock.sendPresenceUpdate('composing', chatId);
        await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (error) {
        console.error('Typing indicator error:', error);
    }
}

// Autoreply command handler (TEXT ONLY)
async function autoreplyCommand(sock, chatId, message) {
    try {
        const senderId = message.key.participant || message.key.remoteJid;
        const isOwner = await isOwnerOrSudo(senderId, sock, chatId);
        
        if (!message.key.fromMe && !isOwner) {
            await sock.sendMessage(chatId, {
                text: '❌ This command is only available for the owner!'
            });
            return;
        }

        // Get command text
        const commandText = message.message?.conversation?.trim() ||
                          message.message?.extendedTextMessage?.text?.trim() || '';
        
        const args = commandText.trim().split(' ').slice(1);
        
        // Initialize config
        const config = initConfig();
        
        // Show status if no arguments
        if (args.length === 0) {
            const status = config.enabled ? '🟢 ON' : '🔴 OFF';
            
            const statusMessage = `📝 *Text Auto Reply*\n\nStatus: ${status}\nMessage: ${config.message}\n\n*Usage:*\n\`.autoreply on [message]\` - Enable with custom message\n\`.autoreply off\` - Disable\n\`.autoreply set [message]\` - Set new message\n\`.autoreply\` - Check status`;
            
            await sock.sendMessage(chatId, {
                text: statusMessage
            });
            return;
        }
        
        const action = args[0]?.toLowerCase() || '';
        
        if (action === 'on') {
            // Enable autoreply
            config.enabled = true;
            
            // Check if there's a custom message
            const customMessage = args.slice(1).join(' ');
            if (customMessage.trim()) {
                config.message = customMessage;
            }
            
            saveConfig(config);
            
            await sock.sendMessage(chatId, {
                text: `✅ *Text Auto Reply Enabled*\n\nMessage: ${config.message}\n\nI will now auto-reply to private messages (except commands and owner/sudo).`
            });
            
        } else if (action === 'off') {
            // Disable autoreply
            config.enabled = false;
            saveConfig(config);
            
            await sock.sendMessage(chatId, {
                text: '❌ *Text Auto Reply Disabled*\n\nI will no longer auto-reply to private messages.'
            });
            
        } else if (action === 'set') {
            // Set new message
            const customMessage = args.slice(1).join(' ');
            if (!customMessage.trim()) {
                await sock.sendMessage(chatId, {
                    text: '❌ Please provide a message!\nExample: `.autoreply set I am busy now`'
                });
                return;
            }
            
            config.message = customMessage;
            saveConfig(config);
            
            await sock.sendMessage(chatId, {
                text: `✅ *Auto Reply Message Updated*\n\nNew message: ${config.message}`
            });
            
        } else {
            await sock.sendMessage(chatId, {
                text: '❌ Invalid command! Use:\n\`.autoreply on [message]\`\n\`.autoreply off\`\n\`.autoreply set [message]\`\n\`.autoreply\`'
            });
        }
        
    } catch (error) {
        console.error('❌ Error in autoreply command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Error processing command!'
        });
    }
}

// Check if autoreply is enabled
function isAutoreplyEnabled() {
    try {
        const config = initConfig();
        return config.enabled;
    } catch (error) {
        console.error('Error checking autoreply status:', error);
        return false;
    }
}

// Get autoreply message
function getAutoreplyMessage() {
    try {
        const config = initConfig();
        return config.message;
    } catch (error) {
        console.error('Error getting autoreply message:', error);
        return DEFAULT_MESSAGE;
    }
}

// Handle autoreply for private messages (TEXT ONLY)
async function handleAutoreply(sock, chatId, senderId, userMessage, message) {
    try {
        // Only respond in private chats
        if (chatId.endsWith('@g.us')) return false;
        
        // Don't respond to bot's own messages
        if (message.key.fromMe) return false;
        
        // Don't respond to commands
        if (userMessage.startsWith('.')) return false;
        
        // Check if autoreply is enabled
        if (!isAutoreplyEnabled()) return false;
        
        // Check if the sender is owner/sudo
        const { isSudo } = require('../lib/index');
        const isOwner = await isOwnerOrSudo(senderId, sock, chatId);
        const senderIsSudo = await isSudo(senderId);
        
        if (isOwner || senderIsSudo) return false;
        
        // Skip if message is too short
        if (!userMessage.trim() || userMessage.trim().length < 1) return false;
        
        // Show typing indicator before sending reply
        await showTypingIndicator(sock, chatId);
        
        // Add a small delay to make it seem more natural
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Get the autoreply message
        const replyMessage = getAutoreplyMessage();
        
        // Send autoreply message WITHOUT forwarded context
        await sock.sendMessage(chatId, {
            text: replyMessage
        });
        
        console.log(`📩 Text autoreply sent to ${senderId}`);
        return true;
        
    } catch (error) {
        console.error('Error in handleAutoreply:', error);
        return false;
    }
}

module.exports = {
    autoreplyCommand,
    isAutoreplyEnabled,
    getAutoreplyMessage,
    handleAutoreply
};