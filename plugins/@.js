//@.js:

let handler = async (m, { conn, text }) => {
  try {
    let groupMetadata = await conn.groupMetadata(m.chat).catch(() => null);
    let participants = groupMetadata.participants || [];
    let caption = (text && text.trim()) ? text.trim() : "CROCO BOT";
    let members = participants.map(v => v.id).filter(id => id && typeof id === 'string');
    await conn.sendMessage(m.chat, {
      text: `@${m.chat}`,
      mentions: members,
      contextInfo: {
        mentionedJid: members,
        groupMentions: [{
          groupSubject: caption,
          groupJid: m.chat
        }]
      }
    });
  } catch (err) {}
};
handler.help = ['@'];
handler.tags = ['group'];
handler.command = /^@$/i;
handler.group = true;
export default handler;