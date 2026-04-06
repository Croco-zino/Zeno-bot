// lib/print.js
import chalk from 'chalk'
import terminalImage from 'terminal-image'
import urlRegexSafe from 'url-regex-safe'
import { downloadContentFromMessage } from '@whiskeysockets/baileys'

export async function printMessage(m, conn) {
  if (!m) return

  // -----------------------
  // Sender Name
  // -----------------------
  let senderName = m.pushName || m.sender.split('@')[0] || 'Unknown'

  if (m.isGroup && conn.groupMetadata) {
    try {
      const metadata = await conn.groupMetadata(m.chat).catch(() => ({ participants: [] }))
      const participant = metadata.participants.find(p => p.jid === m.sender)
      senderName = participant?.name || participant?.id?.split('@')[0] || senderName
    } catch(e) {}
  } else if (!m.isGroup && conn.fetchContact) {
    try {
      const contact = await conn.fetchContact(m.sender).catch(() => ({}))
      senderName = contact?.name || senderName
    } catch(e) {}
  }

  // -----------------------
  // Chat Name
  // -----------------------
  let chatName = m.isGroup
    ? (await conn.groupMetadata?.(m.chat).catch(() => ({ subject: 'Group' }))).subject || 'Group'
    : m.chatName || m.chat.split('@')[0] || 'Private'

  const me = '+' + (conn.user?.jid || '').replace('@s.whatsapp.net', '')
  const userName = conn.user?.name || conn.user?.verifiedName || 'Unknown'

  // -----------------------
  // Message Type
  // -----------------------
  let messageType = 'Unknown'
  try {
    messageType = Object.keys(m.message || {})[0] || 'Unknown'
    if (messageType === 'extendedTextMessage') messageType = 'text'
    else if (messageType === 'imageMessage') messageType = 'image'
    else if (messageType === 'videoMessage') messageType = 'video'
    else if (messageType === 'audioMessage') messageType = m.message.audioMessage?.ptt ? 'ptt' : 'audio'
    else if (messageType === 'stickerMessage') messageType = 'sticker'
    else if (messageType === 'reactionMessage') messageType = 'reaction'
    else if (messageType === 'documentMessage') messageType = 'document'
    else if (messageType === 'contactMessage') messageType = 'contact'
  } catch(e) {
    messageType = 'Unknown'
  }

  const typeColor = {
    text: chalk.green,
    image: chalk.blue,
    video: chalk.magenta,
    audio: chalk.cyan,
    ptt: chalk.cyan,
    sticker: chalk.yellow,
    reaction: chalk.red,
    document: chalk.cyanBright,
    contact: chalk.greenBright
  }[messageType] || chalk.green

  const urlRegex = urlRegexSafe({ strict: false })

  // -----------------------
  // Display Image / Sticker
  // -----------------------
  if (global.opts?.img && /image|sticker/i.test(messageType)) {
    try {
      const buffer = await getBuffer(m.message[Object.keys(m.message)[0]], messageType)
      console.log(await terminalImage.buffer(buffer))
    } catch(e) {
      console.error(chalk.red('Error displaying image:'), e)
    }
  }

  // -----------------------
  // File size
  // -----------------------
  let filesize = 0
  if (m.msg) {
    if (m.msg.fileLength) filesize = m.msg.fileLength.low || m.msg.fileLength
    else if (m.msg.vcard) filesize = m.msg.vcard.length
    else if (m.msg.axolotlSenderKeyDistributionMessage) filesize = m.msg.axolotlSenderKeyDistributionMessage.length
    else if (m.text) filesize = m.text.length
  } else if (m.text) filesize = m.text.length

  // -----------------------
  // Main log header
  // -----------------------
  console.log()
  console.log(`${chalk.hex('#FE0041').bold('╭────────────────────···')}
${chalk.hex('#FE0041').bold('│')} ${chalk.redBright('Bot:')} ${chalk.greenBright(me)} ~ ${chalk.magentaBright(userName)}
${chalk.hex('#FE0041').bold('│')} ${chalk.yellowBright('Date:')} ${chalk.blueBright(new Date().toLocaleString('en-US'))}
${chalk.hex('#FE0041').bold('│')} ${chalk.greenBright('Message Type:')} ${typeColor(messageType)}
${chalk.hex('#FE0041').bold('│')} ${chalk.blueBright('Sender:')} ${chalk.redBright(senderName)}
${chalk.hex('#FE0041').bold('│')} ${chalk.cyanBright(`Chat ${m.isGroup ? 'Group' : 'Private'}:`)} ${chalk.greenBright(chatName)}
${chalk.hex('#FE0041').bold('╰────────────────────···')}`)

  // -----------------------
  // Display Text
  // -----------------------
  if (typeof m.text === 'string' && m.text) {
    let log = m.text.replace(/\u200e+/g, '')
    log = log.replace(urlRegex, url => chalk.blueBright(url))
    if (m.isCommand) log = chalk.yellow(log)
    if (m.error) log = chalk.red(log)

    // Mentions coloring
    if (m.mentionedJid) {
      for (let user of m.mentionedJid) {
        const name = conn.getName ? await conn.getName(user) : user.split('@')[0]
        log = log.replace('@' + user.split('@')[0], chalk.cyanBright('@' + name))
      }
    }
    console.log(log)
  }

  // -----------------------
  // Other types
  // -----------------------
  if (/document/i.test(messageType)) console.log(`🝮 ${m.msg?.fileName || 'Document'}`)
  if (/contact/i.test(messageType)) console.log(`✎ ${m.msg?.displayName || 'Contact'}`)
  if (/audio/i.test(messageType)) {
    const duration = m.msg?.seconds || 0
    console.log(`${m.msg?.ptt ? '☄ (PTT ' : '𝄞 (Audio) '} ${Math.floor(duration/60).toString().padStart(2,'0')}:${(duration%60).toString().padStart(2,'0')}`)
  }
}

// -----------------------
// Helper: get buffer
// -----------------------
async function getBuffer(msg, type) {
  const stream = await downloadContentFromMessage(msg, type)
  let buffer = Buffer.from([])
  for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk])
  return buffer
}