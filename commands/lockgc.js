module.exports = async (sock, chatId, message, rawText, senderId, isGroup) => {
    // ... (The admin and group checks remain exactly the same as in your original file) ...

        // Send processing reaction
        await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

        // --- Core Action: Change group setting to "announcement" ---
        try {
            await sock.groupSettingUpdate(chatId, 'announcement', true);
        } catch (updateError) {
            console.error("groupSettingUpdate failed:", updateError);
            // Try a different method name if the above fails
            // await sock.changeGroupSettings(chatId, { announce: true });
        }

        await sock.sendMessage(chatId, {
            text: "✅ *Group messaging has been locked!*\n\n🚫 *Only admins can now send messages in this group.*",
            // ... (your contextInfo remains) ...
        }, { quoted: message });

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

    // ... (The catch block remains the same) ...
};