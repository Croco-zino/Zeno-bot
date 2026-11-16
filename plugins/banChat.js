let handler = async (m, { conn }) => {
let groups = JSON.parse(fs.readFileSync(groupsFile))

    if (!groups[m.chat]) groups[m.chat] = { off: false }

    groups[m.chat].off = !groups[m.chat].off

    fs.writeFileSync(groupsFile, JSON.stringify(groups, null, 2))

    await conn.sendMessage(
      m.chat,
      { text: `🤖 البوت الآن: ${groups[m.chat].off ? "متوقف" : "يعمل"}` },
      { quoted: m }
    )
};

handler.help = ["bchat"];
handler.tags = ["banChat"];
handler.group = true;
handler.description = "تشغيل/إيقاف البوت في الجروب";
handler.command = /^(bchat|banChat)$/i;
handler.admin = true;

export default handler;