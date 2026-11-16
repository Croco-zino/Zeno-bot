import makeWASocket, {
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  jidNormalizedUser,
  Browsers
} from 'baileys'
import pino from "pino"
import Pino from "pino"
import readline from "readline"
import fs from "fs"
import path from "path"
import { decryptMessageNode, extractMessageContent, normalizeMessageContent } from 'baileys'
import { fileURLToPath } from "url"
import { exec } from "child_process"
import { promisify } from "util"
import NodeCache from "node-cache"
import { Boom } from "@hapi/boom"
import { watch, existsSync, readdirSync, readFileSync } from 'fs'
import { watchFile, unwatchFile } from 'fs'
import { spawn } from 'child_process'
import chalk from "chalk"
import cfonts from "cfonts"
import { printPairingBox } from "./lib/pairLog.js"
import "./config.js"

global.buttonCooldown = new Map()
global.buttonResponses = new Map()

const execPromise = promisify(exec)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const colors = {
  purple: chalk.hex("#6B21A8"),
  violet: chalk.hex("#8B5CF6"),
  red: chalk.hex("#DC2626"),
  gold: chalk.hex("#F59E0B"),
  gray: chalk.hex("#6B7280"),
  green: chalk.hex("#10B981")
}

console.clear()
console.log(colors.green('\n❀ Loading...'))
cfonts.say('Zeno Bot', {
  font: 'simple',
  align: 'left',
  gradient: ['green', 'white']
})
cfonts.say('Made by CROCO', {
  font: 'console',
  align: 'center',
  colors: ['cyan', 'magenta', 'yellow']
})

global.conns = global.conns || []
const pluginFolder = "./plugins"

global.msgRetryCounterCache = new NodeCache({ stdTTL: 0, checkperiod: 0 })
global.userDevicesCache = new NodeCache({ stdTTL: 0, checkperiod: 0 })
global.userCache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

global.dbFile = path.join(__dirname, "database.json")
global.db = { data: null, loading: false, saveQueue: false }

global.loadDatabase = async () => {
  if (global.db.loading) {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!global.db.loading) {
          clearInterval(checkInterval)
          resolve(global.db.data)
        }
      }, 100)
    })
  }
  global.db.loading = true
  try {
    if (!fs.existsSync(global.dbFile)) {
      const defaultData = {
        users: {},
        chats: {},
        settings: {},
        stats: {},
        messages: {}
      }
      fs.writeFileSync(global.dbFile, JSON.stringify(defaultData, null, 2))
      global.db.data = defaultData
    } else {
      global.db.data = JSON.parse(fs.readFileSync(global.dbFile, 'utf-8'))
    }
  } catch (e) {
    console.error(colors.red("❌ Database load error:"), e)
    global.db.data = { users: {}, chats: {}, settings: {}, stats: {}, messages: {} }
  }
  global.db.loading = false
}

global.saveDatabase = async () => {
  if (global.db.saveQueue) return
  global.db.saveQueue = true
  try {
    if (global.db.data) {
      fs.writeFileSync(global.dbFile, JSON.stringify(global.db.data, null, 2))
    }
  } catch (e) {
    console.error(colors.red("❌ Database save error:"), e)
  } finally {
    setTimeout(() => { global.db.saveQueue = false }, 1000)
  }
}

global.getUser = (userId) => {
  let user = global.userCache.get(userId)
  if (!user) {
    user = global.db.data.users[userId] || {
      level: 0,
      exp: 0,
      money: 0,
      limit: 20,
      banned: false,
      registered: false,
      name: null,
      age: null
    }
    global.userCache.set(userId, user)
  }
  return user
}

global.saveUser = (userId, data) => {
  global.db.data.users[userId] = data
  global.userCache.set(userId, data)
  global.saveDatabase()
}

global.support = { ffmpeg: false, ffprobe: false, convert: false, magick: false }

async function checkDependencies() {
  console.log(colors.gray("\n📦 Checking dependencies..."))
  try {
    await execPromise("ffmpeg -version")
    global.support.ffmpeg = true
  } catch {}
  try {
    await execPromise("ffprobe -version")
    global.support.ffprobe = true
  } catch {}
  try {
    await execPromise("convert -version")
    global.support.convert = true
  } catch {}
  try {
    await execPromise("magick -version")
    global.support.magick = true
  } catch {}
  console.log(colors.gray(`  ffmpeg: ${global.support.ffmpeg ? "✅" : "❌"} ffprobe: ${global.support.ffprobe ? "✅" : "❌"}`))
  console.log(colors.gray(`  ImageMagick: ${global.support.convert || global.support.magick ? "✅" : "❌"}`))
}

function cleanTmp() {
  const tmpDir = path.join(__dirname, "tmp")
  if (!fs.existsSync(tmpDir)) return
  try {
    const files = fs.readdirSync(tmpDir)
    const now = Date.now()
    let deleted = 0
    for (let file of files) {
      const filePath = path.join(tmpDir, file)
      try {
        const stats = fs.statSync(filePath)
        if (now - stats.mtimeMs > 5 * 60 * 1000) {
          fs.unlinkSync(filePath)
          deleted++
        }
      } catch {}
    }
    if (deleted > 0) {
      console.log(colors.gray(`🧹 Cleaned ${deleted} old temp files`))
    }
  } catch (e) {
    console.log(colors.red("❌ TMP clean error:"), e.message)
  }
}

function cleanBadSession() {
  const sessionDir = "./Sessions"
  try {
    if (fs.existsSync(sessionDir)) {
      const credsPath = path.join(sessionDir, "creds.json")
      if (fs.existsSync(credsPath)) {
        try {
          const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'))
          if (!creds.registered) {
            console.log(colors.gold("⚠️ Bad session detected, cleaning..."))
            fs.rmSync(sessionDir, { recursive: true, force: true })
          }
        } catch {
          fs.rmSync(sessionDir, { recursive: true, force: true })
        }
      }
    }
  } catch (e) {
    console.log(colors.red("Session clean error:"), e.message)
  }
}

let currentHandler = null
let handlerModule = null

async function loadHandler() {
  try {
    if (global.conn && currentHandler) {
      global.conn.ev.off("messages.upsert", currentHandler)
    }
    const module = await import(`./handler.js?update=${Date.now()}`)
    handlerModule = module
    currentHandler = module.default || module.handler
    if (global.conn && currentHandler) {
      global.conn.ev.on("messages.upsert", currentHandler)
    }
    return true
  } catch (err) {
    console.error(colors.red("❌ Handler load error:"), err)
    return false
  }
}

fs.watchFile("./handler.js", async () => {
  await loadHandler()
  console.log(colors.purple(" update handler.js"))
})

let reconnectAttempts = 0
let isReconnecting = false

async function handleConnectionUpdate(update, conn, startBotFunc) {
  const { connection, lastDisconnect, isNewLogin } = update
  if (connection === "open") {
    reconnectAttempts = 0
    isReconnecting = false
    const userName = conn.user?.name || conn.user?.verifiedName || "Zeno Bot"
    const botNumber = conn.user?.id?.split(":")[0] || "Unknown"
    console.log(colors.violet(`\n╔════════════════════════════════════════╗`))
    console.log(colors.purple(`║  🤖 Bot: ${userName}`.padEnd(43) + "║"))
    console.log(colors.purple(`║  📱 Number: ${botNumber}`.padEnd(43) + "║"))
    console.log(colors.purple(`║  📦 Plugins: ${Object.keys(global.plugins || {}).length}`.padEnd(43) + "║"))
    console.log(colors.violet(`╚════════════════════════════════════════╝\n`))
  }
  if (connection === "close") {
    const statusCode = lastDisconnect?.error?.output?.statusCode
    const reason = new Boom(lastDisconnect?.error)?.output?.statusCode
    console.log(colors.red(`\n❌ Connection closed - Code: ${statusCode || "unknown"}`))
    if (isReconnecting) return
    isReconnecting = true
    if (reason === DisconnectReason.badSession || statusCode === 401 || statusCode === 403) {
      console.log(colors.gold("⚠️ Bad session detected, cleaning..."))
      cleanBadSession()
      console.log(colors.gray("Restarting bot in 3 seconds..."))
      setTimeout(() => {
        process.exit(0)
      }, 3000)
    } else if (reason === DisconnectReason.connectionReplaced) {
      console.log(colors.red("⚠️ Connection replaced by another session"))
      console.log(colors.gray("Exiting..."))
      process.exit(0)
    } else if (statusCode === 428) {
      console.log(colors.red("⚠️ Rate limited, waiting 3 seconds..."))
      setTimeout(() => {
        startBotFunc()
      }, 3000)
    } else if (statusCode === 405 || statusCode === 440) {
      console.log(colors.red("💀 Session expired, restarting..."))
      cleanBadSession()
      setTimeout(() => {
        process.exit(0)
      }, 2000)
    } else if (statusCode === 408) {
      console.log(colors.red(" 🕒 REQUESTS TIMEOUT..."))
      setTimeout(() => {
        startBotFunc()
      }, 2000)
    } else {
      reconnectAttempts++
      const delay = Math.min(5000 * reconnectAttempts, 30000)
      console.log(colors.gray(`🔄 Reconnecting in ${delay/1000} seconds... (Attempt ${reconnectAttempts})`))
      setTimeout(() => {
        startBotFunc()
      }, delay)
    }
  }
}

async function getMessageFromStore(key) {
  try {
    const jid = jidNormalizedUser(key.remoteJid)
    return global.db.data?.messages?.[jid]?.[key.id] || undefined
  } catch {
    return undefined
  }
}

const stripMediaHint = (msg) => {
  const walk = (m) => {
    if (!m || typeof m !== 'object') return m
    if (m.imageMessage?.__hint) { const { imageMessage, ...rest } = m; m = rest }
    if (m.deviceSentMessage?.message) m.deviceSentMessage.message = walk(m.deviceSentMessage.message)
    return m
  }
  return Array.isArray(msg) ? msg.map((x) => ({ ...x, message: walk(x.message) })) : walk(msg)
}

async function startBot() {
  try {
    cleanBadSession()
    await global.loadDatabase()
    await loadHandler()
    await loadPlugins()
    console.info = () => {}
    const { state, saveCreds } = await useMultiFileAuthState("./Sessions")
    const { version } = await fetchLatestBaileysVersion()
    const conn = makeWASocket({
      logger: pino({ level: "fatal" }),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: "fatal" }).child({ level: "fatal" })),
      },
      version,
      browser: ["Ubuntu", "Chrome", "20.0.04"],
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: true,
      syncFullHistory: false,
      msgRetryCounterCache: global.msgRetryCounterCache,
      userDevicesCache: global.userDevicesCache,
      keepAliveIntervalMs: 55000,
      patchMessageBeforeSending: stripMediaHint,
      getMessage: getMessageFromStore
    })
    global.conn = conn
    conn.reply = (chat, text, quoted = null) => {
      return conn.sendMessage(chat, { text }, { quoted })
    }
    conn.react = (jid, key, emoji) => {
      return conn.sendMessage(jid, {
        react: {
          text: emoji,
          key
        }
      })
    }
    conn.sendFile = async (jid, url, filename, caption, quoted, options = {}) => {
      try {
        const buffer = await (await fetch(url)).arrayBuffer()
        return await conn.sendMessage(jid, {
          image: Buffer.from(buffer),
          caption,
          ...options
        }, { quoted })
      } catch {
        return conn.sendMessage(jid, {
          text: caption
        }, { quoted })
      }
    }
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })
    const question = (text) => new Promise(resolve => rl.question(text, resolve))
    if (!fs.existsSync(`./Sessions/creds.json`)) {
      if (!conn.authState.creds.registered) {
        let phoneNumber = global.botNumber
        if (!phoneNumber) {
          console.log("")
          console.log(colors.purple("╔════════════════════════════════════════════════╗"))
          console.log(colors.violet("║        📱 WHATSAPP NUMBER REQUIRED            ║"))
          console.log(colors.purple("╚════════════════════════════════════════════════╝"))
          console.log("")
          phoneNumber = await question(colors.violet("📱 Enter your number: "))
          phoneNumber = phoneNumber.replace(/[^0-9]/g, "")
        }
        console.log(colors.gold(`\n📱 Requesting code for +${phoneNumber}...`))
        setTimeout(async () => {
          try {
            const code = await conn.requestPairingCode(phoneNumber, "LLLLLLLL")
            const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code
            console.log("")
            console.log(colors.purple("╔════════════════════════════════════════════════╗"))
            console.log(colors.violet("║           🔐 PAIRING CODE                     ║"))
            console.log(colors.purple("╠════════════════════════════════════════════════╣"))
            console.log(colors.green(`║           ${formattedCode}                     ║`))
            console.log(colors.purple("╠════════════════════════════════════════════════╣"))
            console.log(colors.gray("║                                                    ║"))
            console.log(colors.gray("║  1. Open WhatsApp on your phone                   ║"))
            console.log(colors.gray("║  2. Settings → Linked Devices                     ║"))
            console.log(colors.gray("║  3. Tap 'Link a Device'                           ║"))
            console.log(colors.gray("║  4. Tap 'Link with phone number instead'          ║"))
            console.log(colors.red(`║  5. Enter this code: ${formattedCode}             ║`))
            console.log(colors.purple("╚════════════════════════════════════════════════╝"))
            console.log("")
            rl.close()
          } catch (err) {
            console.error(colors.red(`❌ Failed: ${err.message}`))
            rl.close()
          }
        }, 3000)
      }
    }

    conn.ev.on("creds.update", saveCreds)
    conn.ev.on("connection.update", (update) => {
      handleConnectionUpdate(update, conn, startBot)
    })
    conn.ev.on("messages.upsert", async ({ messages, type }) => {
    console.log('UPSERT TYPE:', type)
    if (!currentHandler) return
    for (let msg of messages) {
        if (!msg.message) continue
        if (!msg.key.fromMe) {
            const sender = msg.key.participant || msg.key.remoteJid
            if (!global.db.data.messages) global.db.data.messages = {}
            if (!global.db.data.messages[sender]) global.db.data.messages[sender] = {}
            global.db.data.messages[sender][msg.key.id] = {
                ...msg.message,
                messageContextInfo: msg.message?.messageContextInfo
            }
            const keys = Object.keys(global.db.data.messages[sender])
            if (keys.length > 20) {
                for (const k of keys.slice(0, keys.length - 20)) {
                    delete global.db.data.messages[sender][k]
                }
            }
        }
        try {
            await currentHandler(conn, msg)
        } catch (err) {
            console.error(colors.red("Handler error:"), err.message)
        }
    }
})
    console.log(colors.green("[ ✿ ] BOT STARTED SUCCESSFULLY\n"))
  } catch (error) {
    console.error(colors.red("❌ Start error:"), error.message)
    setTimeout(() => startBot(), 5000)
  }
}

let pluginReloadTimers = new Map()

function invalidateCommandMap() {
  global._commandMapBuilt = false
  global.commandMap = new Map()
  global.allFns = []
  global.customPrefixMap = new Map()
  global._regexCommands = []
  global._customPrefixCommands = []
}

function isValidPlugin(plugin) {
  return (
    plugin?.default &&
    (
      typeof plugin.default === 'function' ||
      typeof plugin.default === 'object'
    )
  )
}

async function importPluginFresh(filename) {
  const pluginPath = `./plugins/${filename}?update=${Date.now()}_${Math.random()}`
  return await import(pluginPath)
}

export async function loadPlugins() {
  global.plugins = {}
  let total = 0
  let failed = 0
  console.log(chalk.cyan('\n📂 Loading plugins...'))
  if (!fs.existsSync(pluginFolder)) {
    console.log(chalk.red(`❌ Plugins folder not found: ${pluginFolder}`))
    return
  }
  const files = fs.readdirSync(pluginFolder)
  for (const file of files) {
    if (!file.endsWith(".js")) continue
    try {
      const plugin = await importPluginFresh(file)
      if (!isValidPlugin(plugin)) {
        console.warn(chalk.yellow(`⚠️ Warning: plugin ${file} format not supported`))
        continue
      }
      global.plugins[file] = plugin.default
      total++
      console.log(chalk.green(`  ✓ ${file}`))
    } catch (err) {
      failed++
      console.error(chalk.red(`  ✗ ${file}`))
      console.error(chalk.gray(err.stack || err.message))
    }
  }
  invalidateCommandMap()
  console.log(chalk.green(`\n📦 Total: ${total} plugins loaded, ${failed} failed\n`))
}

async function reloadPlugin(filename) {
  if (!filename || !filename.endsWith('.js')) {
    return
  }
  const filePath = path.join(pluginFolder, filename)
  const exists = fs.existsSync(filePath)
  if (!exists) {
    if (global.plugins?.[filename]) {
      delete global.plugins[filename]
      invalidateCommandMap()
      console.log(chalk.red(`\n🗑️ Plugin deleted: ${filename}`))
      console.log(chalk.gray(`📦 Plugins remaining: ${Object.keys(global.plugins).length}`))
    }
    return
  }
  const wasLoaded = !!global.plugins?.[filename]
  console.log(wasLoaded ? chalk.yellow(`\n🔄 Reloading plugin: ${filename}`) : chalk.cyan(`\n✨ Loading new plugin: ${filename}`))
  try {
    const module = await importPluginFresh(filename)
    if (!isValidPlugin(module)) {
      console.error(chalk.red(`❌ Invalid plugin format: ${filename}`))
      return
    }
    const newPlugin = module.default
    global.plugins[filename] = newPlugin
    invalidateCommandMap()
    console.log(chalk.green(`✅ ${wasLoaded ? 'Reloaded' : 'Loaded'}: ${filename}`))
    console.log(chalk.gray(`📦 Total plugins: ${Object.keys(global.plugins).length}`))
  } catch (err) {
    console.error(chalk.red(`❌ Failed to reload ${filename}`))
    console.error(chalk.gray(err.stack || err.message))
    console.log(chalk.yellow(`⚠️ Old version of ${filename} is still active.`))
  }
}

let pluginWatcher = null

function startPluginWatcher() {
  if (pluginWatcher) {
    try {
      pluginWatcher.close()
    } catch {}
  }
  pluginWatcher = fs.watch(pluginFolder, { persistent: true }, (event, filename) => {
    if (!filename) return
    filename = filename.toString()
    if (!filename.endsWith('.js')) {
      return
    }
    if (pluginReloadTimers.has(filename)) {
      clearTimeout(pluginReloadTimers.get(filename))
    }
    const timer = setTimeout(async () => {
      pluginReloadTimers.delete(filename)
      try {
        await reloadPlugin(filename)
      } catch (err) {
        console.error(colors.red(`❌ Hot reload error for ${filename}:`), err)
      }
    }, 300)
    pluginReloadTimers.set(filename, timer)
  })
  console.log(colors.green("🔥 Plugin Hot Reload: ENABLED"))
}

startPluginWatcher()

const configPath = path.join(process.cwd(), "config.js")
if (fs.existsSync(configPath)) {
  watchFile(configPath, async () => {
    console.log(chalk.yellow("📝 Config file updated..."))
    try {
      await import(`./config.js?update=${Date.now()}`)
      console.log(chalk.green("✅ Config reloaded successfully"))
    } catch (err) {
      console.error(chalk.red("❌ Error reloading config:"), err)
    }
  })
}

console.log(colors.gray("\n⏳ Initializing bot...\n"))

setTimeout(() => {
  startBot()
}, 2000)

process.on('unhandledRejection', (reason, promise) => {
    console.log('⚠️ Unhandled Rejection:', reason?.message || reason)
})

setInterval(() => {
  if (global.conn?.user) {
    cleanTmp()
    global.saveDatabase()
  }
}, 60 * 1000)

setInterval(() => {
  if (global.conn?.user && global.db.data) {
    global.saveDatabase()
  }
}, 30 * 1000)

process.on('SIGINT', async () => {
  console.log(colors.gray("\n👋 Saving data before exit..."))
  await global.saveDatabase()
  process.exit(0)
})

process.on('exit', async () => {
  await global.saveDatabase()
})