import fs from "fs"

const groupsFile = "./groups.json"

export default {
  command: ["bchat"],
  description: "تشغيل/إيقاف البوت في الجروب",
  group: true,

  async execute(m, { conn }) {

    let groups = JSON.parse(fs.readFileSync(groupsFile))

    if (!groups[m.chat]) groups[m.chat] = { off: false }

    groups[m.chat].off = !groups[m.chat].off

    fs.writeFileSync(groupsFile, JSON.stringify(groups, null, 2))

    await conn.sendMessage(
      m.chat,
      { text: `🤖 البوت الآن: ${groups[m.chat].off ? "متوقف" : "يعمل"}` },
      { quoted: m }
    )
  }
}