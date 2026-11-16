let handler = async (m, { conn }) => {
    const chatId = m.chat;

    const groupMetadata = await conn.groupMetadata(chatId).catch(() => null);
    if (!groupMetadata) return m.reply("❌ This command is for groups only!");

    const botId = conn.user.id.split(':')[0] + '@s.whatsapp.net';

    const args = m.text.split(" ");
    const cmd = args[1]?.toLowerCase();

    if (cmd === "on" || cmd === "start") {
        if (!global.contactBlock) global.contactBlock = {};
        if (global.contactBlock[chatId]) return m.reply("🟢 Monitoring is already enabled!");

        global.contactBlock[chatId] = true;

        const listener = async (mek) => {
            const msg = mek.messages[0];
            if (!msg?.message || msg.key.fromMe) return;
            if (msg.key.remoteJid !== chatId) return;
            if (!global.contactBlock[chatId]) {
                conn.ev.off('messages.upsert', listener);
                return;
            }

            const isContact = msg.message.contactMessage ||
                msg.message.vcardMessage ||
                msg.message.contactsArrayMessage ||
                (msg.message.documentMessage?.mimetype?.includes('vcard'));

            if (isContact) {
                try {
                    conn.sendMessage(chatId, {
                        delete: {
                            remoteJid: chatId,
                            fromMe: false,
                            id: msg.key.id,
                            participant: msg.key.participant || msg.key.remoteJid
                        }
                    });
                } catch (e) {
                    console.error("❌ Delete failed:", e.message);
                }
            }
        };

        conn.ev.on('messages.upsert', listener);
        global.contactBlock[`${chatId}_listener`] = listener;

        return m.reply("✅ Contact deletion enabled! Any shared number will be deleted.");
    }

    if (cmd === "off" || cmd === "stop") {
        if (!global.contactBlock?.[chatId]) return m.reply("❌ Monitoring is not enabled!");

        delete global.contactBlock[chatId];
        if (global.contactBlock[`${chatId}_listener`]) {
            conn.ev.off('messages.upsert', global.contactBlock[`${chatId}_listener`]);
            delete global.contactBlock[`${chatId}_listener`];
        }

        return m.reply("🔴 Contact deletion disabled!");
    }

    const menu = `
╔═══「 📇 *Contact Deletion* 」═══╗
│
│ /contacts on   ➜ Enable
│ /contacts off  ➜ Disable
│
│ *Note:*
│ 📇 Deletes any shared number
│ 🛡️ Bot admin required
│
╚═══════════════════════════
    `;

    return conn.sendMessage(chatId, { text: menu, quoted: m });
};

handler.help = ["contacts", "deletecontacts"];
handler.tags = ["group"];
handler.group = true;
handler.description = "Delete contact cards sent in the group";
handler.command = /^(جهات|deletecontacts)$/i;
handler.admin = true;

export default handler;