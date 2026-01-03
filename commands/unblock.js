const fs = require('fs');
const path = require('path');

module.exports = async function unblockCommand(sock, chatId, message) {
    try {
        // Check if user is bot owner
        const sender = message.key.participant || message.key.remoteJid;
        const ownerNumber = "+254769769295"; // Your number
        const ownerJid = ownerNumber.replace('+', '').replace(/\s/g, '') + '@s.whatsapp.net';
        
        // Check if sender is owner
        if (sender !== ownerJid) {
            await sock.sendMessage(chatId, { 
                text: "❌ Only the bot owner can use this command.",
                quoted: message 
            });
            return;
        }

        let targetJid;

        // Check if it's a private chat (1-on-1)
        if (chatId.endsWith('@s.whatsapp.net')) {
            // In private chat: unblock the person you're chatting with
            targetJid = chatId;
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
                    text: "❌ In groups, you must reply to the user's message you want to unblock.\n\nUsage: Reply to their message with `.unblock`",
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

        // Don't allow unblocking yourself (though this shouldn't happen)
        if (targetJid === sender) {
            await sock.sendMessage(chatId, { 
                text: "🤔 You can't unblock yourself!",
                quoted: message 
            });
            return;
        }

        // Don't allow unblocking the bot
        const botNumber = sock.user.id.split(':')[0];
        const botJid = `${botNumber}@s.whatsapp.net`;
        if (targetJid === botJid || targetJid.includes(botNumber)) {
            await sock.sendMessage(chatId, { 
                text: "🤖 The bot is not blocked!",
                quoted: message 
            });
            return;
        }

        // Show processing message
        await sock.sendMessage(chatId, { 
            text: "⏳ Processing unblock request...",
            quoted: message 
        });

        // First check if user is in blocked list file
        let wasInBlockedList = false;
        try {
            const blockedPath = path.join(__dirname, '../data/blocked.json');
            if (fs.existsSync(blockedPath)) {
                const blockedData = JSON.parse(fs.readFileSync(blockedPath, 'utf8'));
                const userIndex = blockedData.users.indexOf(targetJid);
                
                if (userIndex !== -1) {
                    wasInBlockedList = true;
                    // Remove from blocked list
                    blockedData.users.splice(userIndex, 1);
                    fs.writeFileSync(blockedPath, JSON.stringify(blockedData, null, 2));
                }
            }
        } catch (fileError) {
            console.log("Note: Could not update blocked list file");
        }

        // Unblock the user
        try {
            await sock.updateBlockStatus(targetJid, "unblock");
            
            const userNumber = targetJid.split('@')[0];
            
            let responseText = `✅ *User Unblocked Successfully!*\n\n📱 Number: ${userNumber}\n🔓 Status: Unblocked\n📅 Time: ${new Date().toLocaleString()}`;
            
            if (wasInBlockedList) {
                responseText += "\n🗑️ Removed from blocked list file";
            }
            
            await sock.sendMessage(chatId, { 
                text: responseText,
                quoted: message 
            });
            
        } catch (unblockError) {
            console.error("Unblock API error:", unblockError);
            
            // Check if user was already unblocked
            const errorMsg = unblockError.message || '';
            if (errorMsg.includes('not blocked') || errorMsg.includes('already unblocked')) {
                await sock.sendMessage(chatId, { 
                    text: `ℹ️ *User is not blocked*\n\n📱 Number: ${targetJid.split('@')[0]}\n🔓 Status: Already unblocked`,
                    quoted: message 
                });
            } else {
                await sock.sendMessage(chatId, { 
                    text: "❌ Failed to unblock user. Possible reasons:\n• Invalid WhatsApp number\n• Server error\n• User is already unblocked\n\nTry unblocking manually from WhatsApp.",
                    quoted: message 
                });
            }
        }

    } catch (error) {
        console.error("Unblock command error:", error);
        await sock.sendMessage(chatId, { 
            text: `❌ Error: ${error.message}`,
            quoted: message 
        });
    }
};