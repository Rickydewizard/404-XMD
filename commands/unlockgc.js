module.exports = async (sock, chatId, message, rawText, senderId, isGroup) => {
        await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
        try {
            await sock.groupSettingUpdate(chatId, 'announcement', false);
        } catch (updateError) {
            console.error("groupSettingUpdate failed:", updateError);
        }

        await sock.sendMessage(chatId, {
            text: "✅ *Group messaging has been unlocked!*\n\n♻️ * any one can now send messages in this group.*",
        }, { quoted: message });

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
};