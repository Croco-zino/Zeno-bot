// plugins/تست.js
import fetch from "node-fetch";

export default {
  command: ["تست"],
  exp: 5,
  execute: async (m, { conn }) => {
    
    let teks = `
${pickRandom(['`𝐇𝐄𝐑𝐄 𝐅𝐎𝐑 𝐘𝐎𝐔`'])}
`.trim();

    const thumbBuffer = await (await fetch("https://files.catbox.moe/61mjx0.jpg")).buffer();

    const sender = m.sender
    const senderNumber = sender.split('@')[0]
    const vCard = `BEGIN:VCARD\nVERSION:3.0\nN:zeno;croco;;;\nFN:Zeno\nitem1.TEL;waid=${senderNumber}:${senderNumber}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`

    const fkontak = {
      key: {
        participants: '0@s.whatsapp.net',
        remoteJid: 'status@broadcast',
        fromMe: false,
        id: 'Halo'
      },
      message: { contactMessage: { vcard: vCard } },
      participant: '0@s.whatsapp.net'
    }

    await conn.sendMessage(m.chat, {
      text: teks,
      contextInfo: {
        mentionedJid: [m.sender],
        forwardingScore: 9999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: '120363426236435889@newsletter',
          serverMessageId: 777,
          newsletterName: '⧼ 𝐙𝐄𝐍𝐎 ⥃⥌🌺 ⥍⥂𝐁𝐎𝐓 ⧽'
        },
        externalAdReply: {
          title: "🌺⸽⃕❬ 𝐙𝐄𝐍𝐎 𝐁𝐎𝐓 ❭ ✨⃨፝⃕✰",
          body: "⧼ 𝐙𝐄𝐍𝐎 ⥃⥌🌺 ⥍⥂𝐁𝐎𝐓 ⧽",
          thumbnail: thumbBuffer,
          mediaType: 1,
          renderLargerThumbnail: true,
          showAdAttribution: false
        }
      }
    }, { quoted: fkontak });

  }
};

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}