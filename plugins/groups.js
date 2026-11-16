import fetch from "node-fetch";

let handler = async (m, { conn }) => {
    let teks = `📊 *Groups List:*\n\n`;

    const groups = await conn.groupFetchAllParticipating();

    let no = 1;
    for (let id in groups) {
        let group = groups[id];
        teks += `${no++}. ${group.subject}\n👥 Members: ${group.participants.length}\n🆔 ${group.id}\n\n`;
    }

    const thumbBuffer = await (await fetch("https://files.catbox.moe/61mjx0.jpg")).buffer();

    const senderNumber = m.sender.split('@')[0]
    const vCard = `BEGIN:VCARD\nVERSION:3.0\nN:bot;;;\nFN:Group Bot\nitem1.TEL;waid=${senderNumber}:${senderNumber}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`

    const fkontak = {
        key: {
            participants: '0@s.whatsapp.net',
            remoteJid: 'status@broadcast',
            fromMe: false,
            id: 'Groups'
        },
        message: { contactMessage: { vcard: vCard } },
        participant: '0@s.whatsapp.net'
    }

    await conn.sendMessage(m.chat, {
        text: teks,
        contextInfo: {
            mentionedJid: [m.sender],
            forwardingScore: 999,
            isForwarded: true,
            externalAdReply: {
                title: "📂 Groups List",
                body: "View all groups",
                thumbnail: thumbBuffer,
                mediaType: 1,
                renderLargerThumbnail: true,
                showAdAttribution: false
            }
        }
    }, { quoted: fkontak });
};

handler.help = ["groups"];
handler.tags = ['tools'];
handler.owner = true;
handler.command = /^(groups)$/i;

export default handler;