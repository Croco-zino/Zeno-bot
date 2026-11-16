// jid.js

let handler = async (m, { conn }) => {
    const key = m.key || {}
    const chatJid = key.remoteJid || m.chat || ''
    const fromMe = key.fromMe ? 'نعم' : 'لا'

    let text = `╭━━━〔 🆔 JID INFO 〕━━━╮

📌 chat:
${chatJid}

╰━━━━━━━━━━━━━━━━━━━━━━╯`

    await m.reply(text)
}

handler.command = ['jid']
handler.help = ['jid']
handler.tags = ['tools']

export default handler