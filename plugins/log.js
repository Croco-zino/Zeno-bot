

let handler = async (m, { conn }) => {
try {
      await m.react("📄")

      const messages = global.db.data.messages?.[m.chat] || {}
      const keys = Object.keys(messages)

      if (!keys.length) {
        return m.reply("❌ not enough messages to export")
      }

      let text = `📜 Chat Export\n`
      text += `━━━━━━━━━━━━━━━\n\n`

      for (let id of keys) {
        const msg = messages[id]

        let sender = msg.key?.participant || msg.key?.remoteJid || "unknown"
        sender = sender.split("@")[0]

        let content =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          msg.message?.videoMessage?.caption ||
          "[Non-text Message]"

        text += `[${sender}]: ${content}\n`
      }

      const buffer = Buffer.from(text, "utf-8")

      await conn.sendMessage(m.chat, {
        document: buffer,
        fileName: `chat-export.txt`,
        mimetype: "text/plain"
      }, { quoted: m })

    } catch (e) {
      console.log(e)
      m.reply("❌ An error occurred")
    }
};

handler.help = ["export","chat","txt"];
handler.tags = ['tools'];
handler.group = true;
handler.command = /^(export|chat|txt)$/i;
handler.owner = true;

export default handler;
