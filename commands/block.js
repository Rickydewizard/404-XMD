const fs = require('fs');
const path = require('path');

module.exports = async function blockCommand(sock, chatId, message) {
    try {
        // Get the bot's JID first
        const botNumber = sock.user.id.split(':')[0];
        const botJid = `${botNumber}@s.whatsapp.net`;
        
        // Get the sender's JID correctly
        // For private chats: message.key.fromMe tells us if the bot sent it
        // For groups: message.key.participant gives the sender
        let senderJid;
        
        if (message.key.fromMe) {
            // The message was sent BY the bot account (owner typing)
            senderJid = botJid;
        } else if (message.key.participant) {
            // In a group, participant is the sender
            senderJid = message.key.participant;
        } else {
            // In private chat from someone else
            senderJid = message.key.remoteJid;
        }
        
        // Check if user is bot owner
        const ownerNumber = "+254769769295"; // Your number
        const ownerJid = ownerNumber.replace('+', '').replace(/\s/g, '') + '@s.whatsapp.net';
        
        if (senderJid !== ownerJid && !message.key.fromMe) {
            await sock.sendMessage(chatId, { 
                text: "❌ Only the bot owner can use this command.",
                quoted: message 
            });
            return;
        }

        let targetJid;

        // Check if it's a private chat (1-on-1)
        if (chatId.endsWith('@s.whatsapp.net')) {
            // In private chat: block the person you're chatting with
            // This is the OTHER person, not the sender
            targetJid = chatId;
            
            // If the owner sent the command from the bot account (fromMe: true)
            // then we're blocking the other person in the chat
            // If someone else sent it in private, we already blocked them above
        } 
        // Check if it's a group chat
        else if (chatId.endsWith('@g.us')) {
            // In group: Check if you're replying to someone
            const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quoted) {
                // Get the sender of the quoted message
                targetJid = message.message.extendedTextMessage.contextInfo.participant;
            } else {
                await sock.sendMessage(chatId, { 
                    text: "❌ In groups, you must reply to the user's message you want to block.\n\nUsage: Reply to their message with `.block`",
                    quoted: message 
                });
                return;
            }
        } else {
            await sock.sendMessage(chatId, { 
                text: "❌ This command only works in private chats or when replying to someone in groups.",
                quoted: message 
            });
            return;
        }

        // Don't allow blocking yourself
        if (targetJid === senderJid) {
            await sock.sendMessage(chatId, { 
                text: "🤔 You can't block yourself!",
                quoted: message 
            });
            return;
        }

        // Don't allow blocking the bot
        if (targetJid === botJid || targetJid.includes(botNumber)) {
            await sock.sendMessage(chatId, { 
                text: "🤖 You can't block the bot!",
                quoted: message 
            });
            return;
        }

        // Show processing message
        await sock.sendMessage(chatId, { 
            text: "⏳ Processing block request...",
            quoted: message 
        });

        // Block the user
        try {
            await sock.updateBlockStatus(targetJid, "block");
            
            const userNumber = targetJid.split('@')[0];
            
            await sock.sendMessage(chatId, { 
                text: `✅ *User Blocked Successfully!*\n\n📱 Number: ${userNumber}\n🔒 Status: Blocked\n📅 Time: ${new Date().toLocaleString()}`,
                quoted: message 
            });
            
            // Optional: Add to blocked list file
            try {
                const blockedPath = path.join(__dirname, '../data/blocked.json');
                let blockedData = { users: [], groups: {} };
                
                if (fs.existsSync(blockedPath)) {
                    blockedData = JSON.parse(fs.readFileSync(blockedPath, 'utf8'));
                }
                
                if (!blockedData.users.includes(targetJid)) {
                    blockedData.users.push(targetJid);
                    fs.writeFileSync(blockedPath, JSON.stringify(blockedData, null, 2));
                }
            } catch (fileError) {
                console.log("Note: Could not save to blocked list file");
            }
            
        } catch (blockError) {
            console.error("Block API error:", blockError);
            await sock.sendMessage(chatId, { 
                text: "❌ Failed to block user. Possible reasons:\n• They are already blocked\n• Invalid WhatsApp number\n• Server error\n\nTry blocking manually from WhatsApp.",
                quoted: message 
            });
        }

    } catch (error) {
        console.error("Block command error:", error);
        await sock.sendMessage(chatId, { 
            text: `❌ Error: ${error.message}`,
            quoted: message 
        });
    }
};