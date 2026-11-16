import fs from "fs"
import path from "path"
import chalk from "chalk"
import { watchFile, unwatchFile } from "fs"
import { downloadContentFromMessage } from "baileys"
import { printMessage } from "./lib/print.js"
import { checkAndSendLevelUp } from "./lib/levelup.js"
import * as buttonsLib from "./lib/buttons.js"

const { default: _buttonsDefault, ...buttonFns } = buttonsLib
for (const [k, v] of Object.entries(buttonFns)) {
  if (!(k in globalThis)) globalThis[k] = v
}

const CFG = {
  maxMsgAge: global.maxMsgAge ?? 120,
  spamLimit: global.spamLimit ?? 8,
  spamWindow: global.spamWindow ?? 10000,
  groupCacheTtl: 60000,
}

// ============ Utility Functions ============
const isNumber = x => typeof x === "number" && !isNaN(x)
const delay = ms => isNumber(ms) && new Promise(resolve => setTimeout(resolve, ms))
const jidClean = jid => (typeof jid === "string" ? jid.replace(/:\d+@/, "@") : jid)
const botJidOf = conn => jidClean(conn.user?.jid || conn.user?.id || "")

const getBuffer = async (msg, type) => {
  try {
    const stream = await downloadContentFromMessage(msg, type)
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    return Buffer.concat(chunks)
  } catch (err) {
    console.error("Error getting buffer:", err)
    return null
  }
}

// ============ Process-level safety============
if (!global._handlerGuards) {
  global._handlerGuards = true
  process.on("unhandledRejection", (r) => console.error(chalk.red("[unhandledRejection]"), r))
  process.on("uncaughtException", (e) => console.error(chalk.red("[uncaughtException]"), e))
}

// ============ Cache Management ============
class CacheManager {
  constructor(ttl = 60000) {
    this.cache = new Map()
    this.ttl = ttl
  }
  get(key) {
    const entry = this.cache.get(key)
    if (!entry) return null
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key)
      return null
    }
    return entry.value
  }
  set(key, value) { this.cache.set(key, { value, timestamp: Date.now() }) }
  delete(key) { this.cache.delete(key) }
}

const groupCache = new CacheManager(CFG.groupCacheTtl)

export const invalidateGroupCache = (jid) => groupCache.delete(jid)
global.invalidateGroupCache = invalidateGroupCache

const getGroupMetadata = async (conn, jid) => {
  let metadata = groupCache.get(jid)
  if (metadata) return metadata
  try {
    metadata = typeof conn.groupMetadata === "function"
      ? await conn.groupMetadata(jid)
      : { participants: [] }
  } catch {
    metadata = { participants: [] }
  }
  groupCache.set(jid, metadata)
  return metadata
}

// ============ LID ============
const lidCache = new Map()
const toPN = async (conn, jid) => {
  if (!jid || !jid.endsWith("@lid")) return jidClean(jid)
  if (lidCache.has(jid)) return lidCache.get(jid)
  try {
    const pn = await conn.signalRepository?.lidMapping?.getPNForLID(jid)
    if (typeof pn === "string" && pn) {
      const clean = jidClean(pn)
      lidCache.set(jid, clean)
      return clean
    }
  } catch {}
  return jid
}

// ============ File Watcher ============
const createFileWatcher = (filePath, callback) => {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify({}))

  let data = {}
  try {
    data = JSON.parse(fs.readFileSync(filePath))
  } catch {
    data = {}
    fs.writeFileSync(filePath, JSON.stringify(data))
  }

  unwatchFile(filePath)
  watchFile(filePath, () => {
    try {
      data = JSON.parse(fs.readFileSync(filePath))
      callback(data)
    } catch (e) {
      console.error(`Error reloading ${filePath}:`, e)
    }
  })

  return () => data
}

let groups = {}
const getGroups = createFileWatcher("./groups.json", (newData) => { groups = newData })
groups = getGroups()

// ============ Auto Clean + DB Save ============
const autoClean = () => {
  const tmpDir = path.join(process.cwd(), "tmp")
  if (!fs.existsSync(tmpDir)) return

  try {
    const now = Date.now()
    let deleted = 0
    for (const file of fs.readdirSync(tmpDir)) {
      const filePath = path.join(tmpDir, file)
      try {
        if (now - fs.statSync(filePath).mtimeMs > 300000) {
          fs.unlinkSync(filePath)
          deleted++
        }
      } catch (err) {
        console.error(`Error cleaning ${filePath}:`, err.message)
      }
    }
    if (deleted > 0) console.log(chalk.gray(`🧹 Cleaned ${deleted} old temp files`))
  } catch (err) {
    console.error("AutoClean error:", err.message)
  }
}

for (const t of global._intervals || []) clearInterval(t)
global._intervals = [
  setInterval(autoClean, 300000),
  setInterval(async () => {
    try {
      if (global.db?.data) await global.saveDatabase()
    } catch (err) {
      console.error("DB save error:", err.message)
    }
  }, 30000),
  setInterval(() => {
    if (lidCache.size > 5000) lidCache.clear()
    const now = Date.now()
    for (const [k, v] of cooldowns) if (v < now) cooldowns.delete(k)
    for (const [k, v] of spamMap) if (!v.length || now - v[v.length - 1] > CFG.spamWindow) spamMap.delete(k)
  }, 60000),
]

// ============ Extract / Text ============
const WRAPPERS = [
  "viewOnceMessage", "viewOnceMessageV2", "viewOnceMessageV2Extension",
  "ephemeralMessage", "documentWithCaptionMessage",
]

const extractMessage = (msg) => {
  if (!msg) return null
  for (const w of WRAPPERS) {
    if (msg[w]?.message) return extractMessage(msg[w].message)
  }
  return msg
}

const getText = (message) => {
  const nf = message.interactiveResponseMessage?.nativeFlowResponseMessage
  if (nf?.paramsJson) {
    try {
      const p = JSON.parse(nf.paramsJson)
      const id = p.id || p.selectedRowId || p.selected_row_id
      if (id) return String(id)
    } catch {}
  }
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.buttonsResponseMessage?.selectedButtonId ||
    message.listResponseMessage?.singleSelectReply?.selectedRowId ||
    message.listResponseMessage?.title ||
    message.templateButtonReplyMessage?.selectedId ||
    ""
  )
}

const IGNORED_TYPES = ["messageContextInfo", "senderKeyDistributionMessage"]
const getType = (message) => Object.keys(message).find(k => !IGNORED_TYPES.includes(k)) || Object.keys(message)[0]

// ============ Message Processor ============
const smsg = async (conn, m) => {
  if (!m) return m

  if (!conn.getName) {
    conn.getName = async (jid) => {
      if (!jid) return "Unknown"
      if (jidClean(jid) === botJidOf(conn)) return conn.user?.name || conn.user?.verifiedName || "Bot"
      if (global.db?.data?.users?.[jid]?.name) return global.db.data.users[jid].name
      if (jid.endsWith("@g.us")) {
        try {
          return (await getGroupMetadata(conn, jid))?.subject || jid.split("@")[0]
        } catch {}
      }
      return jid.split("@")[0]
    }
  }

  const rawMessage = m.message || {}
  const message = extractMessage(rawMessage) || rawMessage
  const type = getType(message)

  const chat = m.key?.remoteJid || ""
  const fromMe = m.key?.fromMe || false
  const rawSender = fromMe ? botJidOf(conn) : (m.key?.participant || m.key?.remoteJid)
  const sender = await toPN(conn, rawSender)

  const M = {
    ...m,
    type,
    msg: message[type],
    text: getText(message),
    pushName: m.pushName || "",
    sender,
    senderLid: rawSender?.endsWith?.("@lid") ? rawSender : null,
    fromMe,
    isGroup: chat.endsWith("@g.us"),
    id: m.key?.id || "",
    chat,
    quoted: null,
    mentionedJid: [],

    reply: (text, quoted = null) =>
      conn.sendMessage(M.chat, { text }, { quoted: quoted || { key: M.key, message: M.message } }),

    react: (emoji) =>
      conn.sendMessage(M.chat, { react: { text: emoji, key: M.key } }),
  }

  const ctx = Object.values(message).find(v => v && typeof v === "object" && v.contextInfo)?.contextInfo
  if (ctx?.mentionedJid?.length) {
    M.mentionedJid = await Promise.all(ctx.mentionedJid.map(j => toPN(conn, j)))
  }

  try {
    if (ctx?.quotedMessage) {
      const quotedMsg = extractMessage(ctx.quotedMessage) || ctx.quotedMessage
      const mtype = getType(quotedMsg)
      const qSender = await toPN(conn, ctx.participant)
      const qKey = {
        remoteJid: M.chat,
        fromMe: qSender === botJidOf(conn),
        id: ctx.stanzaId,
        participant: ctx.participant,
      }

      M.quoted = {
        key: qKey,
        message: quotedMsg,
        fakeObj: { key: qKey, message: ctx.quotedMessage },
        sender: qSender,
        mtype,
        msg: quotedMsg[mtype],
        text: getText(quotedMsg),
        download: () => getBuffer(quotedMsg[mtype], mtype.replace("Message", "")),
      }
    }
  } catch {}

  return M
}

// ============ Error Messages ============
const errorMessages = {
  rowner: "『✦』الأمر *{cmd}* يخص منشئي البوت فقط.",
  owner: "『✦』الأمر *{cmd}* يخص المطورين فقط.",
  mods: "『✦』الأمر *{cmd}* يخص المشرفين فقط.",
  premium: "『✦』الأمر *{cmd}* يخص المستخدمين المميزين فقط.",
  group: "『✦』الأمر *{cmd}* يخص مجموعات واتساب فقط.",
  private: "『✦』الأمر *{cmd}* يخص المحادثات الخاصة فقط.",
  admin: "『✦』الأمر *{cmd}* يخص مسؤولي المجموعة فقط.",
  botAdmin: "『✦』لتنفيذ الأمر *{cmd}* يجب أن أكون مشرفًا في المجموعة.",
  restrict: "『✦』هذه الميزة معطلة حالياً.",
  disabled: "『✦』الأمر *{cmd}* معطل حالياً.",
  coin: "『✦』رصيدك لا يكفي لتنفيذ الأمر *{cmd}*.",
}

const dfail = (type, m, conn) => {
  const cmd = m.command || m.text?.split?.(" ")?.[0] || ""
  const msg = errorMessages[type]?.replace("{cmd}", cmd)
  if (!msg) return
  conn.sendMessage(m.chat, { react: { text: "🚨", key: m.key } }).catch(() => {})
  return conn.sendMessage(m.chat, { text: msg + "\n\n*Made by Croco 🐊*" }, { quoted: m })
}

// ============ Command Builder ============
const buildCommandMap = () => {
  const commandMap = new Map()
  const allFns = []
  const beforeFns = []
  const customPrefixMap = new Map()
  const regexCommands = []
  const customPrefixRegex = []

  for (const [name, plugin] of Object.entries(global.plugins || {})) {
    if (!plugin || plugin.disabled) continue

    if (typeof plugin.all === "function") allFns.push({ fn: plugin.all, name })
    if (typeof plugin.before === "function") beforeFns.push({ fn: plugin.before, name })

    if (typeof plugin === "function" && plugin.command) {
      const cmds = Array.isArray(plugin.command) ? plugin.command : [plugin.command]
      for (const cmd of cmds) {
        if (typeof cmd === "string") commandMap.set(cmd.toLowerCase(), plugin)
        else if (cmd instanceof RegExp) regexCommands.push({ plugin, pattern: cmd })
      }
    }

    if (typeof plugin === "function" && plugin.customPrefix) {
      const prefix = plugin.customPrefix
      if (prefix instanceof RegExp) customPrefixRegex.push({ plugin, pattern: prefix })
      else if (typeof prefix === "string") customPrefixMap.set(prefix, plugin)
      else if (Array.isArray(prefix)) {
        for (const p of prefix) if (typeof p === "string") customPrefixMap.set(p, plugin)
      }
    }
  }

  global.commandMap = commandMap
  global.allFns = allFns
  global.beforeFns = beforeFns
  global.customPrefixMap = customPrefixMap
  global._regexCommands = regexCommands
  global._customPrefixCommands = customPrefixRegex
  global._commandMapBuilt = true
}

export const reloadCommandMap = () => { global._commandMapBuilt = false; buildCommandMap() }
global.reloadCommandMap = reloadCommandMap

const findCustomPrefix = (text) => {
  for (const [prefix, plugin] of global.customPrefixMap || []) {
    if (text.startsWith(prefix)) {
      return { plugin, prefix, matchedText: text.slice(prefix.length).trim(), isString: true }
    }
  }
  for (const { plugin, pattern } of global._customPrefixCommands || []) {
    const match = text.match(pattern)
    if (match) {
      return { plugin, prefix: match[0], matchedText: text.slice(match[0].length).trim(), isRegex: true }
    }
  }
  return null
}

const matchPrefix = (body) => {
  const pf = global.prefix ?? "."
  for (const p of Array.isArray(pf) ? pf : [pf]) {
    if (p instanceof RegExp) {
      const mm = body.match(p)
      if (mm && mm.index === 0 && mm[0]) return mm[0]
    } else if (typeof p === "string" && p && body.startsWith(p)) {
      return p
    }
  }
  return null
}

// ============ User/Chat Initialization ============
const initUser = (user, pushName) => {
  const defaults = {
    name: pushName || "Unknown", exp: 0, level: 0, commands: 0,
    premium: false, banned: false, warn: 0, coin: 0, bank: 0, health: 100,
    marry: "", premiumTime: 0, afk: -1, afkReason: "",
  }
  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in user)) user[key] = value
  }
  return user
}

const initChat = (chat) => {
  const defaults = {
    isBanned: false, isMute: false, welcome: false, antiLink: true, nsfw: false,
    antiToxic: true, antifake: false, sWelcome: "", sBye: "",
  }
  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in chat)) chat[key] = value
  }
  return chat
}

// ============ Sessions (awaitMessage) ============
const sessions = new Map()
const attachHelpers = (conn) => {
  if (conn.awaitMessage) return
  conn.awaitMessage = (m, { timeout = 60000, filter = () => true } = {}) =>
    new Promise((resolve) => {
      const key = `${m.chat}:${m.sender}`
      const old = sessions.get(key)
      if (old) { clearTimeout(old.timer); old.resolve(null) }
      const timer = setTimeout(() => { sessions.delete(key); resolve(null) }, timeout)
      sessions.set(key, { resolve, timer, filter })
    })
}

// ============ Cooldown / Anti-spam ============
const cooldowns = new Map()
const spamMap = new Map()

const isSpamming = (sender) => {
  const now = Date.now()
  const arr = (spamMap.get(sender) || []).filter(t => now - t < CFG.spamWindow)
  arr.push(now)
  spamMap.set(sender, arr)
  return arr.length > CFG.spamLimit
}

// ============ Dedupe ============
const seen = new Set()
const isDuplicate = (id) => {
  if (!id) return false
  if (seen.has(id)) return true
  seen.add(id)
  if (seen.size > 1000) seen.delete(seen.values().next().value)
  return false
}

// ============ Context Builder ============
const buildContext = async (conn, m, extraArgs = {}) => {
  const db = global.db.data
  db.users ||= {}
  db.chats ||= {}
  db.settings ||= {}

  db.users[m.sender] ||= {}
  const user = initUser(db.users[m.sender], m.pushName)
  db.chats[m.chat] ||= {}
  const chat = initChat(db.chats[m.chat])
  const settings = db.settings[botJidOf(conn)] || {}

  const senderNumber = (m.sender || "").split("@")[0].split(":")[0]
  const owners = Array.isArray(global.owner) ? global.owner.map(v => String(v).replace(/[^0-9]/g, "")) : []
  const isROwner = owners.includes(senderNumber)
  const isOwner = isROwner || m.fromMe

  const prems = Array.isArray(global.prems)
    ? global.prems.map(v => String(v).replace(/[^0-9]/g, "") + "@s.whatsapp.net")
    : []
  const isPrems = isOwner || prems.includes(m.sender) || user.premium

  const isOwners = [botJidOf(conn), ...owners.map(v => v + "@s.whatsapp.net")].includes(m.sender)

  let groupMetadata = { participants: [] }
  let participants = []
  let isAdmin = false
  let isBotAdmin = false

  if (m.isGroup) {
    groupMetadata = await getGroupMetadata(conn, m.chat)
    const idsOf = (p) => [p.id, p.jid, p.lid, p.phoneNumber].filter(Boolean).map(jidClean)
    participants = (groupMetadata.participants || []).map(p => ({
      id: p.phoneNumber || p.jid || p.id,
      lid: p.lid || (p.id?.endsWith?.("@lid") ? p.id : undefined),
      admin: p.admin || false,
      _ids: idsOf(p),
    }))

    const meIds = [m.sender, m.senderLid].filter(Boolean).map(jidClean)
    const botIds = [botJidOf(conn), conn.user?.lid].filter(Boolean).map(jidClean)
    isAdmin = participants.some(p => p.admin && p._ids.some(i => meIds.includes(i)))
    isBotAdmin = participants.some(p => p.admin && p._ids.some(i => botIds.includes(i)))
  }

  return {
    conn, m, text: "", args: [],
    usedPrefix: global.prefix?.[0] ?? global.prefix ?? ".",
    user, chat, settings,
    participants, groupMetadata,
    isOwner, isROwner, isPrems, isOwners,
    isAdmin, isBotAdmin,
    dfail, getBuffer,
    ...extraArgs,
  }
}

// ============ Main Handler ============
export default async function handler(conn, m) {
  if (!m?.key) return

  const chatJid = m.key.remoteJid || ""
  if (chatJid === "status@broadcast" || chatJid.endsWith("@newsletter")) return
  if (isDuplicate(m.key.id)) return
  const ts = Number(m.messageTimestamp?.low ?? m.messageTimestamp)
  if (ts && Date.now() / 1000 - ts > CFG.maxMsgAge) return

  attachHelpers(conn)
  m = await smsg(conn, m)
  if (!m.message) return

  if (!conn.uptime) conn.uptime = Date.now()
  m.exp = m.exp || 0

  if (!global.db?.data) await global.loadDatabase()
  if (!global._commandMapBuilt) buildCommandMap()

  const sessKey = `${m.chat}:${m.sender}`
  const sess = sessions.get(sessKey)
  if (sess) {
    let ok = false
    try { ok = sess.filter(m) } catch {}
    if (ok) {
      clearTimeout(sess.timer)
      sessions.delete(sessKey)
      sess.resolve(m)
      return
    }
  }

  const body = m.text || ""
  let ctx
  try {
    ctx = await buildContext(conn, m)
  } catch (err) {
    console.error("buildContext error:", err)
    return
  }
  const { user, chat, isOwner, isAdmin } = ctx
  for (const { fn, name } of global.beforeFns || []) {
    try {
      if (await fn.call(conn, m, ctx)) return
    } catch (err) {
      console.error(`Error in before plugin ${name}:`, err)
    }
  }

  if (user.banned && !isOwner) return
  if (chat.isBanned && !isOwner) return

  const customMatch = findCustomPrefix(body)
  if (customMatch) {
    const { plugin, matchedText } = customMatch
    const parts = matchedText ? matchedText.split(/ +/) : []
    const commandName = customMatch.isString ? plugin.command?.[0] || "custom" : "custom"
    if (chat.isMute && !isAdmin && !isOwner) return
    await executeCommand(conn, m, plugin, parts, commandName, ctx)
    return
  }

  const usedPrefix = matchPrefix(body)
  if (usedPrefix) {
    const args = body.slice(usedPrefix.length).trim().split(/ +/)
    const commandName = (args.shift() || "").toLowerCase()
    if (!commandName) return
    ctx.usedPrefix = usedPrefix

    let plugin = global.commandMap?.get(commandName)
    if (!plugin) {
      for (const { plugin: p, pattern } of global._regexCommands || []) {
        if (pattern.test(commandName)) { plugin = p; break }
      }
    }
    if (!plugin) return
    if (chat.isMute && !isAdmin && !isOwner) return

    await executeCommand(conn, m, plugin, args, commandName, ctx)
    return
  }

  await Promise.allSettled(
    (global.allFns || []).map(async ({ fn, name }) => {
      try {
        await fn.call(conn, m, { conn, ...ctx })
      } catch (err) {
        console.error(`Error in all plugin ${name}:`, err)
      }
    })
  )

  if (!m.printed) {
    await printMessage(m, conn)
    m.printed = true
  }
}

// ============ Command Executor ============
async function executeCommand(conn, m, plugin, args, commandName, ctx) {
  const { user, chat, isOwner, isROwner, isPrems, isAdmin, isBotAdmin } = ctx
  m.command = commandName

  if (global.devMode && !isOwner) return
  if (m.isGroup && groups[m.chat]?.off && commandName !== "bchat") return

  const extra = { ...ctx, args, text: args.join(" "), command: commandName }

  if (plugin.disabled) return dfail("disabled", m, conn)
  if (plugin.rowner && !isROwner) return dfail("rowner", m, conn)
  if (plugin.owner && !isOwner) return dfail("owner", m, conn)
  if (plugin.mods && !isOwner && !(global.mods || []).map(v => String(v).replace(/[^0-9]/g, "")).includes(m.sender.split("@")[0])) return dfail("mods", m, conn)
  if (plugin.premium && !isPrems) return dfail("premium", m, conn)
  if (plugin.group && !m.isGroup) return dfail("group", m, conn)
  if (plugin.private && m.isGroup) return dfail("private", m, conn)
  if (plugin.admin && !isAdmin && !isOwner) return dfail("admin", m, conn)
  if (plugin.botAdmin && !isBotAdmin) return dfail("botAdmin", m, conn)
  if (plugin.restrict && global.restrict === false) return dfail("restrict", m, conn)

  const cost = Number(plugin.coin) || 0
  if (cost && !isOwner && user.coin < cost) return dfail("coin", m, conn)

  if (!isOwner) {
    if (isSpamming(m.sender)) {
      if (!m._spamWarned) await m.reply("⏳ مهلاً! بتبعت أوامر كتير، استنى شوية.").catch(() => {})
      return
    }
    const cd = Number(plugin.cooldown) || 0
    if (cd) {
      const key = `${commandName}:${m.sender}`
      const until = cooldowns.get(key) || 0
      if (until > Date.now()) {
        const left = Math.ceil((until - Date.now()) / 1000)
        return m.reply(`⏳ استنى ${left} ثانية قبل ما تستخدم *${commandName}* تاني.`)
      }
      cooldowns.set(key, Date.now() + cd * 1000)
    }
  }

  m.exp += plugin.exp ? parseInt(plugin.exp) : 10

  const run = () => plugin.call(conn, m, extra)
  const presence = (type) => Promise.resolve(conn.sendPresenceUpdate?.(type, m.chat)).catch(() => {})

  try {
    presence("composing")
    try {
      await run()
    } catch (err) {
      if (err?.message?.includes("429")) {
        console.log("⚠️ Rate limit detected, retrying once...")
        await delay(2000)
        await run()
      } else {
        throw err
      }
    }

    if (cost && !isOwner) user.coin -= cost

    if (!m.printed) {
      m.isCommand = true
      await printMessage(m, conn)
      m.printed = true
    }

    user.commands++
    user.exp += m.exp
    checkAndSendLevelUp(conn, m, user)
  } catch (err) {
    m.error = err
    console.error(chalk.red(`❌ Error in ${commandName}:`), err)
    m.reply(`❌ حصل خطأ أثناء تنفيذ *${commandName}*.\nتم إبلاغ المطور.`).catch(() => {})
    try {
      const ownerNum = Array.isArray(global.owner) ? String(global.owner[0]).replace(/[^0-9]/g, "") : ""
      if (ownerNum) {
        const stack = String(err?.stack || err).split("\n").slice(0, 6).join("\n")
        await conn.sendMessage(ownerNum + "@s.whatsapp.net", {
          text: `⚠️ *Error*\nالأمر: ${commandName}\nالمستخدم: @${m.sender.split("@")[0]}\nالشات: ${m.chat}\n\n\`\`\`${stack}\`\`\``,
          mentions: [m.sender],
        })
      }
    } catch {}
  } finally {
    presence("paused")
  }
}