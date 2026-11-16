import fetch from "node-fetch";

let handler = async (m, { conn }) => {
    const groups = await conn.groupFetchAllParticipating();
    let total = Object.keys(groups).length;

    let teks = `🚪 Leaving ${total} groups...\n`;

    const thumbBuffer = await (await fetch("https://files.catbox.moe/61mjx0.jpg")).buffer();

    const senderNumber = m.sender.split('@')[0]
    const vCard = `BEGIN:VCARD\nVERSION:3.0\nN:bot;;;\nFN:Leave Bot\nitem1.TEL;waid=${senderNumber}:${senderNumber}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`

    const fkontak = {
        key: {
            participants: '0@s.whatsapp.net',
            remoteJid: 'status@broadcast',
            fromMe: false,
            id: 'LeaveAll'
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
                title: "🚪 Leaving All Groups",
                body: "Executing...",
                thumbnail: thumbBuffer,
                mediaType: 1,
                renderLargerThumbnail: true,
                showAdAttribution: false
            }
        }
    }, { quoted: fkontak });

    for (let id in groups) {
        await conn.groupLeave(id);
    }

    await conn.sendMessage(m.chat, {
        text: "✅ Successfully left all groups"
    }, { quoted: fkontak });
};

handler.help = ["leaveall"];
handler.tags = ['tools'];
handler.command = /^(leaveall)$/i;
handler.owner = true;

export default handler;