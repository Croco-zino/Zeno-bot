import makeWASocket, {
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  jidNormalizedUser
} from '@whiskeysockets/baileys'
import pino from "pino"
import Pino from "pino"
import readline from "readline"
import fs from "fs"
import path from "path"
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
global.jadi = global.jadi || "jadibot"
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
const jadiPath = path.join(__dirname, global.jadi)
if (!fs.existsSync(jadiPath)) {
    fs.mkdirSync(jadiPath, { recursive: true })
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
    
    if (global.owner && global.owner[0]) {
      try {
        const ownerJid = global.owner[0] + "@s.whatsapp.net"
        await conn.sendMessage(ownerJid, {
          text: `⚔️ *${global.botName || "Zeno Bot"}* is now ONLINE!\n\n🕐 Time: ${new Date().toLocaleString()}\n📦 Status: Active\n🤖 Version: ${global.botVersion || "1.0.0"}`
        })
      } catch (e) {
        console.log(colors.red("Could not notify owner:", e.message))
      }
    }
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
    } else if (statusCode === 408 ) {
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
    if (global.db.data?.messages?.[jid]?.[key.id]) {
      return global.db.data.messages[jid][key.id]
    }
    return ""
  } catch {
    return ""
  }
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
      logger: pino({ level: "silent" }),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: "fatal" }).child({ level: "fatal" })),
        },
      version,
      browser: ["MacOs", "Safari"],
      markOnlineOnConnect: false,
      generateHighQualityLinkPreview: true,
      syncFullHistory: false,
      msgRetryCounterCache: global.msgRetryCounterCache,
      userDevicesCache: global.userDevicesCache,
      keepAliveIntervalMs: 55000,
      getMessage: getMessageFromStore
    })
    
    global.conn = conn

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
            const code = await conn.requestPairingCode(phoneNumber)
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
    
    conn.ev.on("messages.upsert", async ({ messages }) => {
  if (!currentHandler) return
  
  for (let msg of messages) {
    if (!msg.message) continue
    
    const chat = msg.key.remoteJid
    if (!global.db.data.messages) global.db.data.messages = {}
    if (!global.db.data.messages[chat]) global.db.data.messages[chat] = {}
    if (msg.message) global.db.data.messages[chat][msg.key.id] = msg.message
    
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

export async function loadPlugins() {
  global.plugins = {}
  let total = 0
  let failed = 0
  
  console.log(chalk.cyan('\n📂 Loading plugins...'))
  
  for (let file of fs.readdirSync(pluginFolder)) {
    if (!file.endsWith(".js")) continue
    try {
      let plugin = await import(`./plugins/${file}?update=${Date.now()}`)
      if (plugin.default && typeof plugin.default === 'function') {
        global.plugins[file] = plugin.default
        total++
      }
      else if (plugin.default && plugin.default.command) {
        global.plugins[file] = plugin.default
        total++
      }
      else if (plugin.default) {
        console.warn(chalk.yellow(`⚠️ Warning: plugin ${file} format not supported`))
      }
    } catch (err) {
      failed++
      console.error(chalk.red(`❌ Error in plugin ${file}:`), err)
    }
  }
  
  console.log(chalk.green(`\n📦 Total: ${total} plugins loaded, ${failed} failed\n`))
}

fs.watch(pluginFolder, async (event, filename) => {
  if (!filename || !filename.endsWith(".js")) return
  
  const filePath = path.join(pluginFolder, filename)
  const exists = fs.existsSync(filePath)
  
  if (!exists && global.plugins[filename]) {
    delete global.plugins[filename]
    console.log(chalk.red(`🗑️ Deleted: ${filename}`))
    return
  }
  
  if (exists) {
    const isUpdate = !!global.plugins[filename]
    console.log(isUpdate ? chalk.yellow(`🔄 Updating: ${filename}`) : chalk.cyan(`✨ New: ${filename}`))
    
    try {
      let plugin = await import(`./plugins/${filename}?update=${Date.now()}`)
      
      if (plugin.default && (typeof plugin.default === 'function' || plugin.default.command)) {
        global.plugins[filename] = plugin.default
        console.log(chalk.green(`✅ ${isUpdate ? 'Updated' : 'Loaded'}: ${filename}`))
        console.log(chalk.gray(`📦 Total plugins: ${Object.keys(global.plugins).length}`))
      }
    } catch (err) {
      console.error(chalk.red(`❌ Error loading plugin ${filename}:`), err.message)
    }
  }
})

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