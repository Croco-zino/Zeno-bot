export default {
  command: ["o"],
  description: "تشغيل/إيقاف وضع المطورين",
  owner: true,

  async execute(m, { conn, isOwner }) {
    global.devMode = global.devMode || false
    if (!isOwner) return

    global.devMode = !global.devMode

    await conn.sendMessage(
      m.chat,
      { text: `💡 وضع المطورين تم تغييره: ${global.devMode}` },
      { quoted: m }
    )
  }
}