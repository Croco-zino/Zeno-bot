import fetch from "node-fetch";

let handler = async (m, { conn }) => {
    
    let teks = `
${pickRandom(['`𝐇𝐄𝐑𝐄 𝐅𝐎𝐑 𝐘𝐎𝐔`'])}
`.trim();

    const sender = m.sender
    const senderNumber = sender.split('@')[0]
    const vCard = `BEGIN:VCARD\nVERSION:3.0\nN:croco;bot;;;\nFN:croco bot\nitem1.TEL;waid=${senderNumber}:${senderNumber}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`

    global.fkontak = {
      key: {
        participants: '0@s.whatsapp.net',
        remoteJid: 'status@broadcast',
        fromMe: false,
        id: 'Halo'
      },
      message: { contactMessage: { vcard: vCard } },
      participant: '0@s.whatsapp.net'
    }

    global.fakegif = {
      key: {
        participant: '0@s.whatsapp.net',
        remoteJid: '6289643739077-1613049930@g.us'
      },
      message: {
        videoMessage: {
          title: '🎴 croco bot',
          h: 'Hmm',
          seconds: '99999',
          gifPlayback: 'true',
          caption: '🎴 croco bot',
          jpegThumbnail: false
          }
        }
      }

    await conn.sendMessage(m.chat, {
      text: teks,
      contextInfo: {
        mentionedJid: [m.sender],
        forwardingScore: 9999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: '120363424237184600@newsletter',
          serverMessageId: 777,
          newsletterName: '⧼ 𝐙𝐄𝐍𝐎 ⥃⥌🌺 ⥍⥂𝐁𝐎𝐓 ⧽'
        },
      }
    }, { quoted: global.fkontak });

  }

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

handler.help = ['test'];
handler.command = /^test$/i;
handler.owner = true;

export default handler;