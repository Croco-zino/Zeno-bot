let handler = async (m, { conn, isOwner }) => {
global.devMode = global.devMode || false
    if (!isOwner) return

    global.devMode = !global.devMode

    await conn.sendMessage(
      m.chat,
      { text: `💡 وضع المطورين تم تغييره: ${global.devMode}` },
      { quoted: m }
    )
};

handler.help = ["o"];
handler.tags = ["ownerReverse"];
handler.owner = true;
handler.description = "تشغيل/إيقاف وضع المطورين";
handler.command = /^(o|ownerReverse)$/i;

export default handler;