// file: antibot.js | WhatsApp Bot Plugin | Baileys

import fs from 'fs';

const antibotPath    = './data/antibot_usync.json';
const kickedLogPath  = './data/antibot_kicked.json';

if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
if (!fs.existsSync(antibotPath))   fs.writeFileSync(antibotPath,   JSON.stringify({}, null, 2));
if (!fs.existsSync(kickedLogPath)) fs.writeFileSync(kickedLogPath, JSON.stringify({}, null, 2));

// ============ Helpers ============
const readJSON  = (p) => { try { return JSON.parse(fs.readFileSync(p)); } catch { return {}; } };
const writeJSON = (p, d) => fs.writeFileSync(p, JSON.stringify(d, null, 2));

const getOwnerNumbers = () =>
  (global.owner || []).map(v => v.replace(/[^0-9]/g, ''));

const isExempt = (jid, connJid) => {
  if (jid === connJid) return true;
  const num = jid.split('@')[0].split(':')[0];
  return getOwnerNumbers().includes(num);
};

// ============ Scan Loop ============
let scanStarted = false;

const startScanLoop = (conn) => {
  if (scanStarted) return;
  scanStarted = true;

  setInterval(async () => {
    const antibott      = readJSON(antibotPath);
    const enabledGroups = Object.keys(antibott).filter(k => antibott[k] === true);
    if (!enabledGroups.length) return;

    for (const chatId of enabledGroups) {
      try {
        const meta = await conn.groupMetadata(chatId).catch(() => null);
        if (!meta?.participants?.length) continue;

        const kicked    = readJSON(kickedLogPath);
        const toKick    = [];
        const mentions  = [];

        for (const p of meta.participants) {
          const jid = p.id || p.jid;
          if (!jid) continue;

          if (isExempt(jid, conn.user.jid)) continue;
          if (p.admin === 'admin' || p.admin === 'superadmin') continue;

          const lastKick = kicked[`${chatId}:${jid}`] || 0;
          if (Date.now() - lastKick < 300000) continue;

          let devices = [];
          try { devices = await conn.getUSyncDevices([jid], false, false) || []; }
          catch { continue; }

          if (devices.length <= 1) continue;

          toKick.push({ jid, deviceCount: devices.length });
          mentions.push(jid);
        }

        if (!toKick.length) continue;

        const lines = toKick.map(({ jid, deviceCount }) => {
          const num = jid.split('@')[0].split(':')[0];
          return `┃  👤 @${num}  —  📡 ${deviceCount} أجهزة`;
        });

        await conn.sendMessage(chatId, {
          text:
            `╭━━━━━━━━━━━━━━━━━━━╮\n` +
            `┃  🚨 *تم اكتشاف ${toKick.length} بوت/جلسة!*\n` +
            `┃━━━━━━━━━━━━━━━━━━━\n` +
            lines.join('\n') + '\n' +
            `┃\n` +
            `┃  ⚡ *الإجراء:* جاري طرد الجميع...\n` +
            `╰━━━━━━━━━━━━━━━━━━━╯`,
          mentions
        });

        await conn.groupParticipantsUpdate(
          chatId,
          toKick.map(x => x.jid),
          'remove'
        ).catch(() => {});

        const now = Date.now();
        for (const { jid } of toKick) kicked[`${chatId}:${jid}`] = now;
        writeJSON(kickedLogPath, kicked);

      } catch (err) {
        console.error(`[ANTIBOT SCAN] ${chatId}:`, err.message);
      }
    }
  }, 10000);
};

// ============ Command Handler ============
let handler = async (m, { conn, args, isAdmin, isROwner, usedPrefix, command }) => {
  if (!m.isGroup) return m.reply('❌ هذا الأمر للمجموعات فقط!');
  if (!isAdmin && !isROwner) return m.reply('❌ للأدمن فقط!');

  startScanLoop(conn);

  const chatId    = m.chat;
  const antibott  = readJSON(antibotPath);
  const isEnabled = antibott[chatId] === true;
  const arg       = (args[0] || '').toLowerCase();

  if (arg === 'اون' || arg === 'on') {
    if (isEnabled) return m.reply('⚠️ مضاد البوتات مفعل بالفعل!');
    antibott[chatId] = true;
    writeJSON(antibotPath, antibott);
    return m.reply(
      `✅ تم تفعيل مضاد البوتات!\n` +
      `> 🛡️ فحص كل 10 ثواني على جميع الأعضاء.\n` +
      `> المطورون مستثنون تلقائياً سواء كانوا أدمن أو لا.`
    );
  }

  if (arg === 'اوف' || arg === 'off') {
    if (!isEnabled) return m.reply('⚠️ مضاد البوتات معطل بالفعل!');
    delete antibott[chatId];
    writeJSON(antibotPath, antibott);
    return m.reply('❌ تم تعطيل مضاد البوتات.');
  }

  const status = isEnabled ? '✅ مفعل' : '❌ معطل';
  return m.reply(
    `╭━━━━━━━━━━━━━━━━━━━━╮\n` +
    `┃   🛡️ *مضاد البوتات (الأجهزة)*\n` +
    `┃━━━━━━━━━━━━━━━━━━━━\n` +
    `┃\n` +
    `┃  📌 *الحالة:* ${status}\n` +
    `┃  🔄 *الفحص:* كل 10 ثواني\n` +
    `┃\n` +
    `┃  ⚡ *الأوامر:*\n` +
    `┃  ├ ${usedPrefix + command} اون\n` +
    `┃  └ ${usedPrefix + command} اوف\n` +
    `╰━━━━━━━━━━━━━━━━━━━━╯`
  );
};

// ============ Before Handler ============
handler.before = async function (m, { conn }) {
  try {
    if (!m.isGroup) return false;

    const participants =
      m.participants ||
      (m.messageStubType === 27 || m.messageStubType === 30
        ? [m.messageStubParameters?.[0]]
        : null);
    if (!participants?.length) return false;

    const antibott = readJSON(antibotPath);
    if (antibott[m.chat] !== true) return false;

    startScanLoop(conn);

    const kicked   = readJSON(kickedLogPath);
    const toKick   = [];
    const mentions = [];

    for (const jid of participants) {
      if (!jid) continue;
      if (isExempt(jid, conn.user.jid)) continue;

      let devices = [];
      try { devices = await conn.getUSyncDevices([jid], false, false) || []; }
      catch { continue; }

      if (devices.length <= 1) continue;

      toKick.push({ jid, deviceCount: devices.length });
      mentions.push(jid);
    }

    if (!toKick.length) return false;

    const lines = toKick.map(({ jid, deviceCount }) => {
      const num = jid.split('@')[0].split(':')[0];
      return `┃  👤 @${num}  —  📡 ${deviceCount} أجهزة`;
    });

    await conn.sendMessage(m.chat, {
      text:
        `╭━━━━━━━━━━━━━━━━━━━╮\n` +
        `┃  🚨 *تم اكتشاف ${toKick.length} بوت عند الدخول!*\n` +
        `┃━━━━━━━━━━━━━━━━━━━\n` +
        lines.join('\n') + '\n' +
        `┃\n` +
        `┃  ⚡ *الإجراء:* جاري طرد الجميع...\n` +
        `╰━━━━━━━━━━━━━━━━━━━╯`,
      mentions
    });

    await conn.groupParticipantsUpdate(
      m.chat,
      toKick.map(x => x.jid),
      'remove'
    ).catch(() => {});

    const now = Date.now();
    for (const { jid } of toKick) kicked[`${m.chat}:${jid}`] = now;
    writeJSON(kickedLogPath, kicked);

  } catch (err) {
    console.error('[ANTIBOT BEFORE]', err.message);
  }
  return false;
};

handler.help    = ['مضاد_البوتات', 'antibot'];
handler.tags    = ['group'];
handler.command = /^(مضاد_البوتات|antibot|مضادبوات)$/i;
handler.group   = true;
handler.admin   = true;

export default handler;