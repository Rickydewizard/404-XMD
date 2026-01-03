/**
 * 404 XMD - Auto Voice Reply Command
 * Separate command for voice note auto-replies
 */

const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const isOwnerOrSudo = require('../lib/isOwner');

// Path to store the configuration
const configPath = path.join(__dirname, '..', 'data', 'autovoice.json');
const voiceNotesDir = path.join(__dirname, '..', 'data', 'autovoice_voices');

// Create voice notes directory if it doesn't exist
if (!fs.existsSync(voiceNotesDir)) {
    fs.mkdirSync(voiceNotesDir, { recursive: true });
}

// Initialize configuration
function initConfig() {
    if (!fs.existsSync(configPath)) {
        const defaultConfig = {
            enabled: false,
            voiceNotePath: null,
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

// Save voice note
async function saveVoiceNote(sock, message, userId) {
    try {
        console.log('🎤 Saving voice note for autovoice...');
        
        if (!message.message?.audioMessage) {
            throw new Error('No audio message found');
        }
        
        const buffer = await downloadMediaMessage(
            message,
            'buffer',
            {},
            { 
                logger: console,
                reuploadRequest: sock.updateMediaMessage 
            }
        );
        
        if (!buffer || buffer.length === 0) {
            throw new Error('Downloaded buffer is empty');
        }
        
        console.log(`🎤 Downloaded ${buffer.length} bytes`);
        
        const filename = `autovoice_${userId}_${Date.now()}.opus`;
        const filepath = path.join(voiceNotesDir, filename);
        
        fs.writeFileSync(filepath, buffer);
        console.log(`🎤 Saved to: ${filepath}`);
        
        // Delete old voice note
        const config = initConfig();
        if (config.voiceNotePath && fs.existsSync(config.voiceNotePath)) {
            fs.unlinkSync(config.voiceNotePath);
            console.log('🗑️ Deleted old voice note');
        }
        
        return filepath;
    } catch (error) {
        console.error('❌ Error saving voice note:', error);
        throw error;
    }
}

// Get voice note buffer
function getVoiceNoteBuffer() {
    try {
        const config = initConfig();
        if (!config.voiceNotePath || !fs.existsSync(config.voiceNotePath)) {
            return null;
        }
        return fs.readFileSync(config.voiceNotePath);
    } catch (error) {
        console.error('Error getting voice note:', error);
        return null;
    }
}

// Show recording indicator
async function showRecordingIndicator(sock, chatId) {
    try {
        await sock.sendPresenceUpdate('recording', chatId);
        await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
        console.error('Recording indicator error:', error);
    }
}

// Auto voice command handler
async function autovoiceCommand(sock, chatId, message) {
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
        const commandText = message._originalCommand || '';
        const args = commandText.trim().split(' ').slice(1);
        
        // Initialize config
        const config = initConfig();
        
        // Check if we're saving a voice note
        const isSavingVoiceNote = (message._isVoiceNote || message._isReplyToVoiceNote) && 
                                  commandText.includes('.autovoice');
        
        if (isSavingVoiceNote) {
            try {
                console.log('💾 Saving voice note for autovoice...');
                let messageToSave = message;
                
                if (message._isReplyToVoiceNote) {
                    messageToSave = {
                        ...message,
                        message: {
                            audioMessage: message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage
                        }
                    };
                }
                
                const voicePath = await saveVoiceNote(sock, messageToSave, senderId.split('@')[0]);
                config.voiceNotePath = voicePath;
                config.enabled = true;
                saveConfig(config);
                
                await sock.sendMessage(chatId, {
                    text: '✅ *Auto Voice Reply Enabled!*\n\nYour voice note has been saved. I will now auto-reply with this voice note to private messages.'
                });
                return;
            } catch (error) {
                console.error('❌ Error saving voice note:', error);
                await sock.sendMessage(chatId, {
                    text: '❌ Failed to save voice note!\n\nReply to a voice note with `.autovoice` or send a voice note with caption `.autovoice`'
                });
                return;
            }
        }
        
        // Handle commands
        const action = args[0]?.toLowerCase() || '';
        
        if (!action) {
            // Show status
            const status = config.enabled ? '🟢 ON' : '🔴 OFF';
            const voiceNoteStatus = config.voiceNotePath ? '✅ Set' : '❌ Not Set';
            
            const statusMessage = `🎤 *Auto Voice Reply*\n\nStatus: ${status}\nVoice Note: ${voiceNoteStatus}\n\n*Usage:*\n\`.autovoice on\` - Enable\n\`.autovoice off\` - Disable\nSend voice note with caption \`.autovoice\` to set\n\`.autovoice\` - Check status`;
            
            await sock.sendMessage(chatId, {
                text: statusMessage
            });
            return;
        }
        
        if (action === 'on') {
            if (!config.voiceNotePath) {
                await sock.sendMessage(chatId, {
                    text: '❌ No voice note set! Send a voice note with caption `.autovoice` first.'
                });
                return;
            }
            
            config.enabled = true;
            saveConfig(config);
            
            await sock.sendMessage(chatId, {
                text: '✅ *Auto Voice Reply Enabled*\n\nI will now auto-reply with voice notes to private messages.'
            });
            
        } else if (action === 'off') {
            config.enabled = false;
            saveConfig(config);
            
            await sock.sendMessage(chatId, {
                text: '❌ *Auto Voice Reply Disabled*\n\nI will no longer auto-reply with voice notes.'
            });
            
        } else {
            await sock.sendMessage(chatId, {
                text: '❌ Invalid command! Use:\n\`.autovoice on\`\n\`.autovoice off\`\nSend voice note with caption \`.autovoice\`'
            });
        }
        
    } catch (error) {
        console.error('❌ Error in autovoice command:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Error processing command!'
        });
    }
}

// Check if autovoice is enabled
function isAutovoiceEnabled() {
    try {
        const config = initConfig();
        return config.enabled && config.voiceNotePath;
    } catch (error) {
        console.error('Error checking autovoice status:', error);
        return false;
    }
}

// Handle autovoice replies
async function handleAutovoice(sock, chatId, senderId, userMessage, message) {
    try {
        // Only respond in private chats
        if (chatId.endsWith('@g.us')) return false;
        
        // Don't respond to bot's own messages
        if (message.key.fromMe) return false;
        
        // Don't respond to commands
        if (userMessage.startsWith('.')) return false;
        
        // Check if autovoice is enabled
        if (!isAutovoiceEnabled()) return false;
        
        // Check if the sender is owner/sudo
        const { isSudo } = require('../lib/index');
        const isOwner = await isOwnerOrSudo(senderId, sock, chatId);
        const senderIsSudo = await isSudo(senderId);
        
        if (isOwner || senderIsSudo) return false;
        
        // Skip if message is too short
        if (!userMessage.trim() || userMessage.trim().length < 1) return false;
        
        // Show recording indicator before sending voice note
        await showRecordingIndicator(sock, chatId);
        
        // Small delay to make it natural
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Send voice note
        const voiceBuffer = getVoiceNoteBuffer();
        if (voiceBuffer) {
            await sock.sendMessage(chatId, {
                audio: voiceBuffer,
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true
            });
            
            console.log(`🎤 Autovoice sent to ${senderId}`);
            return true;
        }
        
        return false;
        
    } catch (error) {
        console.error('Error in handleAutovoice:', error);
        return false;
    }
}

module.exports = {
    autovoiceCommand,
    isAutovoiceEnabled,
    handleAutovoice
};