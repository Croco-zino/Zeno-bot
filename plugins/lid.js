let handler = async (m, { conn }) => {
  const chatId = m.chat
  const target =
    m.quoted?.sender ||
    m.msg?.contextInfo?.participant ||
    m.mentionedJid?.[0] ||
    m.sender

  await conn.sendMessage(chatId, { text: `${target}` }, { quoted: m })
  let sender = target
  if (sender.endsWith('@lid')) {
    sender = await conn.signalRepository.lidMapping.getPNForLID(sender)
  }
  if (!sender) return conn.sendMessage(chatId, { text: '❌ Could not retrieve number from LID' }, { quoted: m })
  const senderNumber = sender.split('@')[0].split(':')[0]
  await conn.sendMessage(chatId, { text: `${senderNumber}` }, { quoted: m })
}

handler.help = ['lid']
handler.tags = ['tools']
handler.command = /^(lid)$/i
handler.owner = true

export default handler