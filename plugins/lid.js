export default {
  command: ["lid"],
  execute: async (m, { conn }) => {
    const chatId = m.key.remoteJid
    const senderId = m.key.participant || m.key.remoteJid
    const number = senderId.split('@')[0]
    await conn.sendMessage(chatId, {
      text: `${number}`
    })
  }
}