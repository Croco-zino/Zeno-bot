export default {
  command: ["level", "lvl", "rank"],

  async execute(m, { conn, user }) {
    const level = user.level || 0
    const exp = user.exp || 0

    const min = level * level * 100
    const max = (level + 1) * (level + 1) * 100

    const current = exp - min
    const needed = max - min

    await conn.sendMessage(m.chat, {
      text: `
👤 الاسم: ${m.pushName}
📊 الليفل: ${level}
⭐ الخبرة: ${exp}

📈 التقدم: ${current}/${needed}
      `.trim()
    }, { quoted: m })
  }
}