import fs from "fs"
import path, { join } from "path"
import { fileURLToPath } from "url"
import ws from "ws"
import chalk from "chalk"
import { watchFile, unwatchFile } from 'fs'
import { downloadContentFromMessage } from "@whiskeysockets/baileys"
import { printMessage } from "./lib/print.js"
import { getRank, getLevel, xpRange } from "./lib/level.js"
import { checkAndSendLevelUp } from "./lib/levelup.js"

function checkSyntax(code, filename) {
  try {
    new Function(code)
    return null
  } catch (err) {
    return { message: err.message, line: err.lineNumber }
  }
}

const groupCache = new Map()

async function getGroupMetadata(conn, jid) {
  if (groupCache.has(jid)) return groupCache.get(jid)
  const metadata = await conn.groupMetadata(jid).catch(() => ({ participants: [] }))
  groupCache.set(jid, metadata)
  setTimeout(() => groupCache.delete(jid), 60 * 1000)
  return metadata
}

const groupsFile = "./groups.json"
if (!fs.existsSync(groupsFile)) {
  fs.writeFileSync(groupsFile, JSON.stringify({}))
}
let groups = JSON.parse(fs.readFileSync(groupsFile))

const isNumber = x => typeof x === "number" && !isNaN(x)

const delay = ms => isNumber(ms) && new Promise(resolve => setTimeout(function () {
  clearTimeout(this)
  resolve()
}, ms))

function autoClean() {
    const tmpDir = path.join(process.cwd(), "tmp")
    if (!fs.existsSync(tmpDir)) return
    try {
        const files = fs.readdirSync(tmpDir)
        const now = Date.now()
        let deleted = 0
        for (const file of files) {
            const filePath = path.join(tmpDir, file)
            try {
                const stats = fs.statSync(filePath)
                if (now - stats.mtimeMs > 5 * 60 * 1000) {
                    fs.unlinkSync(filePath)
                    deleted++
                }
            } catch (err) {
                console.error(`Error cleaning ${filePath}:`, err.message)
            }
        }
        if (deleted > 0) {
            console.log(chalk.gray(`🧹 Cleaned ${deleted} old temp files`))
        }
    } catch (err) {
        console.error("AutoClean error:", err.message)
    }
}
setInterval(autoClean, 5 * 60 * 1000)

function smsg(conn, m) {
  if (!m) return m
  
  if (conn && !conn.reply) {
    conn.reply = (chat, text, quoted = null) => {
      return conn.sendMessage(chat, { text: text }, { quoted: quoted })
    }
  }
  
  if (conn && !conn.react) {
    conn.react = async (jid, key, emoji) => {
      return await conn.sendMessage(jid, { react: { text: emoji, key: key } })
    }
  }
  
  if (conn && !conn.sendFile) {
    conn.sendFile = async (jid, url, filename, caption, quoted, options = {}) => {
        try {
            let buffer = await (await fetch(url)).buffer()
            return await conn.sendMessage(jid, {
                image: buffer,
                caption: caption,
                ...options
            }, { quoted: quoted })
        } catch (e) {
            return await conn.sendMessage(jid, { text: caption }, { quoted: quoted })
        }
    }
  }
  
  if (conn && !conn.getName) {
    conn.getName = async (jid) => {
      try {
        if (!jid) return 'Unknown'
        if (jid === conn.user.jid) {
          return conn.user.name || conn.user.verifiedName || 'Bot'
        }
        if (global.db.data.users[jid] && global.db.data.users[jid].name) {
          return global.db.data.users[jid].name
        }
        if (jid.includes('@g.us')) {
          try {
            const metadata = await conn.groupMetadata(jid)
            if (metadata && metadata.subject) return metadata.subject
          } catch (e) {}
          return jid.split('@')[0]
        }
        try {
          const contact = await conn.contactQuery(jid)
          if (contact && contact.name) return contact.name
          if (contact && contact.verifiedName) return contact.verifiedName
          if (contact && contact.notify) return contact.notify
        } catch (e) {}
        return jid.split('@')[0]
      } catch (err) {
        console.error('Error in conn.getName:', err)
        return jid.split('@')[0]
      }
    }
  }
  
  const M = {
    ...m,
    type: Object.keys(m.message || {})[0],
    text: m.message?.conversation || 
          m.message?.extendedTextMessage?.text || 
          m.message?.imageMessage?.caption ||
          m.message?.videoMessage?.caption ||
          m.message?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
          m.message?.buttonsResponseMessage?.selectedButtonId ||
          m.message?.listResponseMessage?.title ||
          m.message?.templateButtonReplyMessage?.selectedId ||
          "",
    pushName: m.pushName || "",
    sender: m.key?.participant || m.key?.remoteJid,
    fromMe: m.key?.fromMe || false,
    isGroup: m.key?.remoteJid?.endsWith("@g.us") || false,
    id: m.key?.id || "",
    chat: m.key?.remoteJid || "",
    quoted: null
  }
  
  M.reply = (text, quoted = M) => {
    return conn.sendMessage(M.chat, { text: text }, { quoted: quoted || M })
  }
  
  M.react = (emoji) => {
    return conn.sendMessage(M.chat, { react: { text: emoji, key: M.key } })
  }
  
  try {
    if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
      const q = m.message.extendedTextMessage.contextInfo
      M.quoted = {
        message: q.quotedMessage,
        sender: q.participant,
        mtype: Object.keys(q.quotedMessage || {})[0]
      }
    }
  } catch (e) {
    console.error("❌ خطأ في smsg:", e)
  }
  return M
}

async function getBuffer(msg, type) {
  const stream = await downloadContentFromMessage(msg, type)
  let buffer = Buffer.from([])
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk])
  }
  return buffer
}

function dfail(type, m, conn) {
  const comando = (m.text && typeof m.text === 'string') ? m.text.split(" ")[0] : ""
  
  const messages = {
    rowner: `『✦』الأمر *${comando}* يخص منشئي البوت فقط.`,
    owner: `『✦』الأمر *${comando}* يخص المطورين فقط.`,
    mods: `『✦』الأمر *${comando}* يخص المشرفين فقط.`,
    premium: `『✦』الأمر *${comando}* يخص المستخدمين المميزين فقط.`,
    group: `『✦』الأمر *${comando}* يخص مجموعات واتساب فقط.`,
    private: `『✦』الأمر *${comando}* يخص المحادثات الخاصة فقط.`,
    admin: `『✦』الأمر *${comando}* يخص مسؤولي المجموعة فقط.`,
    botAdmin: `『✦』لتنفيذ الأمر *${comando}* يجب أن أكون مشرفًا في المجموعة.`,
    restrict: `『✦』هذه الميزة معطلة حالياً.`
  }
  const msg = messages[type]
  if (msg) {
    conn.sendMessage(m.key.remoteJid, {
        react: {
            text: "🚨",
            key: m.key
        }
    });
    return conn.sendMessage(m.chat, { text: msg + "\n\n*Made by Croco 🐊*" }, { quoted: m })
  }
}

const queue = []
let isProcessing = false

async function processQueue() {
  if (isProcessing) return
  isProcessing = true

  while (queue.length) {
    const task = queue.shift()
    try {
      await task()
    } catch (e) {
      console.error("Queue Error:", e)
    }
    await delay(50)
  }

  isProcessing = false
}

const spamMap = new Map()

function isSpam(sender) {
  const now = Date.now()
  if (!spamMap.has(sender)) {
    spamMap.set(sender, { count: 1, time: now })
    return false
  }

  const data = spamMap.get(sender)

  if (now - data.time < 3000) {
    data.count++
    if (data.count > 5) return true
  } else {
    data.count = 1
    data.time = now
  }

  return false
}

const cooldowns = new Map()

function isCooldown(sender, command, time = 3000) {
  const key = sender + command
  const now = Date.now()

  if (!cooldowns.has(key)) {
    cooldowns.set(key, now)
    return false
  }

  const last = cooldowns.get(key)
  if (now - last < time) {
    return Math.ceil((time - (now - last)) / 1000)
  }

  cooldowns.set(key, now)
  return false
}

export default async function handler(conn, m) {
  if (!m) return
  m = smsg(conn, m)
  if (!m.reply) m.reply = (text, quoted = m) => conn.sendMessage(m.chat, { text }, { quoted: quoted || m })
  if (!conn.reply) conn.reply = (chat, text, quoted = null) => conn.sendMessage(chat, { text }, { quoted: quoted })
  if (!conn.msgqueque) conn.msgqueque = []
  if (!conn.uptime) conn.uptime = Date.now()
  if (isSpam(m.sender)) return
  m.exp = m.exp || 0

  if (!global.db?.data) await global.loadDatabase()
  if (!global.db.data.users[m.sender]) {global.db.data.users[m.sender] = {}}
  const user = global.db.data.users[m.sender]
  if (!global.db.data.chats[m.chat]) {global.db.data.chats[m.chat] = {}}
  const chat = global.db.data.chats[m.chat]
  const settings = global.db.data.settings[conn.user.jid] || {}

  user.name ||= m.pushName || "Unknown"
  user.exp ||= 0
  user.level ||= 0
  user.commands ||= 0
  user.premium ||= false
  user.banned ||= false
  user.warn ||= 0
  
  if (!("coin" in user)) user.coin = 0
  if (!("bank" in user)) user.bank = 0
  if (!("health" in user)) user.health = 100
  if (!("marry" in user)) user.marry = ""
  if (!("premiumTime" in user)) user.premiumTime = 0
  if (!("afk" in user)) user.afk = -1
  if (!("afkReason" in user)) user.afkReason = ""

  chat.isBanned ||= false
  chat.isMute ||= false
  chat.welcome ||= false
  chat.antiLink ||= true
  chat.nsfw ||= false
  chat.antiToxic ||= true
  chat.antifake ||= false
  if (chat.welcome) {
    if (!("sWelcome" in chat)) chat.sWelcome = ""
    if (!("sBye" in chat)) chat.sBye = ""
  }

  const senderNumber = m.sender.split("@")[0].split(":")[0]
const isROwner = global.owner
  .map(v => v.replace(/[^0-9]/g, ""))
  .includes(senderNumber)
  const isOwner = isROwner || m.fromMe
  const isPrems = isOwner || global.prems.map(v => v.replace(/[^0-9]/g, "") + "@s.whatsapp.net").includes(m.sender) || user.premium
  const isOwners = [conn.user.jid, ...global.owner.map(v => v + "@s.whatsapp.net")].includes(m.sender)

  const groupMetadata = m.isGroup ? await getGroupMetadata(conn, m.chat) : { participants: [] }
  const participants = (groupMetadata.participants || []).map(p => ({ id: p.jid, admin: p.admin || false }))
  const userGroup = participants.find(u => u.id === m.sender) || {}
  const botGroup = participants.find(u => u.id === conn.user.jid) || {}
  const isAdmin = userGroup.admin || false
  const isBotAdmin = botGroup.admin || false
  for (let name in global.plugins) {
    const plugin = global.plugins[name];
    if (plugin && typeof plugin.all === 'function') {
      try {
        await plugin.all.call(conn, conn, m);
      } catch (err) {
        console.error(`Error in all plugin ${name}:`, err);
      }
    }
  }
  let body = m.message?.conversation || 
               m.message?.extendedTextMessage?.text || 
               m.message?.imageMessage?.caption ||
               m.message?.videoMessage?.caption ||
               m.message?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
               ""
  if (m.text && !body) body = m.text
  const prefix = global.prefix
  if (!body.startsWith(prefix)) {
    if (!m.printed) {
      await printMessage(m, conn)
      m.printed = true
    }
    return
  }

  let args = body.slice(prefix.length).trim().split(/ +/)
  const commandName = args.shift().toLowerCase()
  const opts = global.opts || {}
  if (opts["queque"] && m.text && !(isPrems)) {
    const queque = conn.msgqueque
    const time = 1000 * 5
    const previousID = queque[queque.length - 1]
    queque.push(m.id || m.key.id)
    setTimeout(async function checkQueue() {
      if (queque.indexOf(previousID) === -1) return
      await delay(time)
      checkQueue()
    }, time)
  }
  groups = JSON.parse(fs.readFileSync(groupsFile))
  if (global.devMode && !isOwner) return
  if (m.isGroup && groups[m.chat]?.off && commandName !== "bchat") return
  
  for (let name in global.plugins) {
    const plugin = global.plugins[name]
    if (!plugin) continue
    let isAccept = false
    let commandPattern = null
    if (typeof plugin === 'function' && plugin.command) {
      commandPattern = plugin.command
      if (commandPattern instanceof RegExp) {
        isAccept = commandPattern.test(commandName)
      } else if (Array.isArray(commandPattern)) {
        isAccept = commandPattern.includes(commandName)
      } else if (typeof commandPattern === 'string') {
        isAccept = commandPattern === commandName
      }
    }
    else if (plugin.command) {
      commandPattern = plugin.command
      if (Array.isArray(commandPattern)) {
        isAccept = commandPattern.includes(commandName)
      } else if (typeof commandPattern === 'string') {
        isAccept = commandPattern === commandName
      } else if (commandPattern instanceof RegExp) {
        isAccept = commandPattern.test(commandName)
      }
    }
    
    if (!isAccept) continue
    
    const cdTime = plugin.cooldown || 2
    const cd = isCooldown(m.sender, commandName, cdTime * 1000)
    if (cd) {
      return conn.sendMessage(m.chat, {
        text: `⏳ استنى ${cd} ثانية قبل استخدام الأمر تاني`
      }, { quoted: m })
    }
    let text = args.join` `
    const extra = {
      conn, 
      m, 
      args,
      text,
      command: commandName, 
      usedPrefix: prefix, 
      user, 
      chat, 
      settings,
      participants, 
      groupMetadata,
      isOwner, 
      isROwner, 
      isPrems, 
      isOwners,
      isAdmin, 
      isBotAdmin, 
      dfail, 
      getBuffer
    }

    if (plugin.owner && !isOwner) {
      dfail("owner", m, conn)
      continue
    }
    if (plugin.rowner && !isROwner) {
      dfail("rowner", m, conn)
      continue
    }
    if (plugin.premium && !isPrems) {
      dfail("premium", m, conn)
      continue
    }
    if (plugin.group && !m.isGroup) {
      dfail("group", m, conn)
      continue
    }
    if (plugin.private && m.isGroup) {
      dfail("private", m, conn)
      continue
    }
    if (plugin.admin && !isAdmin) {
      dfail("admin", m, conn)
      continue
    }
    if (plugin.botAdmin && !isBotAdmin) {
      dfail("botAdmin", m, conn)
      continue
    }
    
    m.exp += plugin.exp ? parseInt(plugin.exp) : 10
    
    try {
      if (typeof plugin === 'function') {
        queue.push(async () => {
          await plugin.call(conn, m, extra)
          if (!m.printed) {
            m.isCommand = true
            m.command = commandName
            await printMessage(m, conn)
            m.printed = true
          }
        })
      } 
      else if (plugin.execute) {
        queue.push(async () => {
          await plugin.execute(m, extra)
          if (!m.printed) {
            m.isCommand = true
            m.command = commandName
            await printMessage(m, conn)
            m.printed = true
          }
        })
      }
      
      processQueue()
      user.commands += 1
      user.exp = (user.exp || 0) + m.exp
      checkAndSendLevelUp(conn, m, user)
      await global.saveDatabase()
    } catch (err) {
      m.error = err
      if (err?.message?.includes("429")) {
        console.log("⚠️ Rate limit detected, slowing down...")
        await delay(2000)
      }
      console.error(chalk.red(`❌ خطأ في تنفيذ الأمر ${commandName} في plugin ${name}:`), err)
    }
    break
  }
}