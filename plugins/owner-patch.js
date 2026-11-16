import fs from 'fs'
import path from 'path'

let currentPath = process.cwd()

const PROTECTED_FILES = [
  'config.js', 'index.js', 'package.json', 'package-lock.json',
  'database.json', 'data.json', '.env', '.git', 'session',
  'creds.json', 'auth_info.json', 'session.json'
]

const HIDDEN_FILES = [
  '.env', '.git', 'session', 'creds.json',
  'auth_info.json', 'session.json', 'database.json',
  'data.json', 'package-lock.json', 'Sessions', 'groups.json'
]

let handler = async (m, { conn, text }) => {

  let args = text ? text.split(' ') : []
  let action = args[0] ? args[0].toLowerCase() : ''
  let target = args[1]

  try {
    if (!action) {
      let files = await fs.promises.readdir(currentPath, { withFileTypes: true })
      let filteredFiles = files.filter(f => !HIDDEN_FILES.includes(f.name))
      let list = filteredFiles.map((f, i) => `${i + 1}. ${f.isDirectory() ? '📁' : '📄'} ${f.name}`).join('\n')
      return m.reply(`📂 *Current Directory:*\n\n${list}\n\n🔹 *Usage:*\n• *.files open 4* ← to enter a folder\n• *.files back* ← to return to the bot root\n• *.files view 3* ← to view a file's content\n• *.files delete 6* ← to delete a file\n• *.files add test.js* ← to create a new file`)
    }

    if (action === 'فتح' || action === 'open') {
      if (target === '..' || target === '../' || target.includes('..')) {
        return m.reply('🚫 Not allowed to leave the bot directory.')
      }
      let files = await fs.promises.readdir(currentPath, { withFileTypes: true })
      let filteredFiles = files.filter(f => !HIDDEN_FILES.includes(f.name))
      let index = parseInt(target) - 1
      if (isNaN(index) || index < 0 || index >= filteredFiles.length) return m.reply('⚠️ Invalid number.')
      let chosen = filteredFiles[index]
      if (!chosen.isDirectory()) return m.reply('❌ This is a file, not a folder.')

      currentPath = path.join(currentPath, chosen.name)
      let sub = await fs.promises.readdir(currentPath, { withFileTypes: true })
      let filteredSub = sub.filter(f => !HIDDEN_FILES.includes(f.name))
      let list = filteredSub.map((f, i) => `${i + 1}. ${f.isDirectory() ? '📁' : '📄'} ${f.name}`).join('\n')
      return m.reply(`\n${list}`)
    }

    if (action === 'رجوع' || action === 'back') {
      const botRoot = process.cwd()
      if (currentPath === botRoot) {
        return m.reply('📂 You are already in the bot root directory.')
      }
      currentPath = botRoot
      let files = await fs.promises.readdir(currentPath, { withFileTypes: true })
      let filteredFiles = files.filter(f => !HIDDEN_FILES.includes(f.name))
      let list = filteredFiles.map((f, i) => `${i + 1}. ${f.isDirectory() ? '📁' : '📄'} ${f.name}`).join('\n')
      return m.reply(`\n${list}`)
    }

    if (action === 'عرض' || action === 'view') {
      let files = await fs.promises.readdir(currentPath, { withFileTypes: true })
      let filteredFiles = files.filter(f => !HIDDEN_FILES.includes(f.name))
      let index = parseInt(target) - 1
      if (isNaN(index) || index < 0 || index >= filteredFiles.length) return m.reply('⚠️ Invalid number.')
      let chosen = filteredFiles[index]
      if (chosen.isDirectory()) return m.reply('📁 This is a folder, not a file.')
      let filePath = path.join(currentPath, chosen.name)
      let content = await fs.promises.readFile(filePath, 'utf8')
      const stats = await fs.promises.stat(filePath)
      const sizeKB = (stats.size / 1024).toFixed(2)
      const lines = content.split('\n').length
      const ext = path.extname(chosen.name).replace('.', '') || 'txt'

      const caption = `
╭━━━━━━━━━━━━━━━━━━━╮
   *File Info*
╰━━━━━━━━━━━━━━━━━━━╯

┌───────────────────┐
│ *name :* ${chosen.name}
│ *size :* ${sizeKB} KB
│ *lines :* ${lines}
│ *type :* ${ext.toUpperCase()}
│ *path :* ${currentPath.replace(process.cwd(), '.') || '.'}
└───────────────────┘

━━━━━━━━━━━━━━━━━━━
  > *By Zeno*
━━━━━━━━━━━━━━━━━━━
`.trim()

      return conn.sendMessage(m.chat, {
        document: Buffer.from(content, 'utf8'),
        fileName: chosen.name,
        mimetype: 'text/plain',
        caption
      }, { quoted: m })
    }

    if (action === 'حذف' || action === 'delete') {
      try {
        if (!fs.existsSync(currentPath)) return m.reply('⚠️ Path does not exist.')
        let files = await fs.promises.readdir(currentPath, { withFileTypes: true })
        let filteredFiles = files.filter(f => !HIDDEN_FILES.includes(f.name))
        if (!filteredFiles || filteredFiles.length === 0) return m.reply('⚠️ Folder is empty.')

        const raw = String(target ?? '').trim()
        const index = Number(raw) - 1

        if (!raw) return m.reply('⚠️ Enter the number of the item you want to delete.')
        if (!Number.isFinite(index) || Number.isNaN(index)) return m.reply('⚠️ Invalid number.')
        if (index < 0 || index >= filteredFiles.length) return m.reply(`⚠️ Number out of range. Available from 1 to ${filteredFiles.length}.`)

        let chosen = filteredFiles[index]
        let filePath = path.join(currentPath, chosen.name)

        if (PROTECTED_FILES.includes(chosen.name)) {
          return m.reply('🚫 This file is protected and cannot be deleted.')
        }

        if (fs.existsSync(filePath)) {
          let stats = await fs.promises.stat(filePath)
          if (stats.isDirectory()) {
            await fs.promises.rm(filePath, { recursive: true, force: true })
            return m.reply(`✅ Folder *${chosen.name}* deleted successfully.`)
          } else {
            await fs.promises.unlink(filePath)
            return m.reply(`✅ File *${chosen.name}* deleted successfully.`)
          }
        } else {
          return m.reply('⚠️ File does not exist.')
        }

      } catch (err) {
        console.error('Error in delete: ', err)
        return m.reply('⚠️ An error occurred while deleting.')
      }
    }

    if (action === 'اضافه' || action === 'add') {
      if (!target) return m.reply('⚠️ Enter the file name.\nExample: *.files add test.js*')
      if (target.includes('..') || target.includes('./') || target.includes('/') || target.includes('\\')) {
        return m.reply('🚫 Invalid file name. Cannot use .. or / or \\')
      }
      if (!path.extname(target)) target = target + '.js'
      let filePath = path.join(currentPath, target)

      const botRoot = process.cwd()
      if (!filePath.startsWith(botRoot)) {
        return m.reply('🚫 Not allowed to write outside the bot directory.')
      }

      let content = ''

      try {
        if (m.quoted && m.quoted.text) {
          content = m.quoted.text
        } else if (m.quoted && m.quoted.message) {
          const quotedMsg = m.quoted.message
          if (quotedMsg.conversation) {
            content = quotedMsg.conversation
          } else if (quotedMsg.extendedTextMessage?.text) {
            content = quotedMsg.extendedTextMessage.text
          } else if (quotedMsg.imageMessage?.caption) {
            content = quotedMsg.imageMessage.caption
          } else if (quotedMsg.videoMessage?.caption) {
            content = quotedMsg.videoMessage.caption
          }
        }
      } catch (e) {
        console.log('Error getting quoted text:', e)
      }

      if (!content) {
        let rest = args.slice(2).join(' ')
        if (!rest) return m.reply('⚠️ Enter the file content or reply to a message containing the code.')
        content = rest
      }

      await fs.promises.writeFile(filePath, content, 'utf8')
      return m.reply(`✅ File created: *${target}*`)
    }

    m.reply('❌ Unknown command.')

  } catch (err) {
    console.error(err)
    m.reply(`⚠️ An error occurred:\n${err.message}`)
  }
}

handler.help = ['files']
handler.tags = ['owner']
handler.command = /^(ملفات|files)$/i
handler.owner = true

export default handler