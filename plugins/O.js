import fs from "fs"
import path, { join } from "path"

let handler = async (m, { conn, args, text, command, isOwner }) => {

  if (command === 'المطورين' || command === 'owners' || command === 'المالكين') {
    try {
      if (!global.owner || global.owner.length === 0) {
        return m.reply(`⚠️ No owners are currently registered

You can add a new owner using:
.addowner @mention or by replying to the person's message`)
      }

      try {
        const configPath = './config.js'
        const configContent = fs.readFileSync(configPath, 'utf8')
        const ownerRegex = /global\.owner\s*=\s*\[(.*?)\]/s
        const match = configContent.match(ownerRegex)

        if (match) {
          const ownersMatch = match[1].match(/"([^"]+)"|'([^']+)'/g)
          if (ownersMatch) {
            const fileOwners = ownersMatch.map(num => num.replace(/["']/g, ''))
            if (JSON.stringify(global.owner) !== JSON.stringify(fileOwners)) {
              global.owner = fileOwners
            }
          }
        }
      } catch (readError) {
        console.error("Error reading config file:", readError)
      }

      let ownerList = `👥 Bot Owners List\n━━━━━━━━━━━━━━━━━━\n\n`

      const sortedOwners = [...global.owner].sort()

      for (let i = 0; i < sortedOwners.length; i++) {
        ownerList += `${i + 1}. +${sortedOwners[i]}\n`
      }

      ownerList += `\n━━━━━━━━━━━━━━━━━━\n`
      ownerList += `📊 Total: ${global.owner.length} owners`

      const mentions = global.owner.map(owner => owner + "@s.whatsapp.net")

      await conn.sendMessage(
        m.chat,
        {
          text: ownerList,
          mentions: mentions
        },
        { quoted: m }
      )

    } catch (err) {
      console.error("❌ Error in owners command:", err)
      m.reply(`❌ Error: ${err.message}`)
    }
  }

  else if (command === 'ضيف_مطور' || command === 'addowner') {
    if (!isOwner) return m.reply('❌ This command is for owners only')

    try {
      let targetUser = null

      if (m.quoted && m.quoted.sender) {
        targetUser = m.quoted.sender
      }
      else if (m.mentionedJid && m.mentionedJid.length > 0) {
        targetUser = m.mentionedJid[0]
      }
      else if (args[0]) {
        const fullNumber = args.join(" ")
        let number = fullNumber.replace(/\D/g, "")

        if (number) {
          targetUser = number + "@s.whatsapp.net"
        }
      }

      if (!targetUser) {
        return m.reply(`❌ Usage:
• .addowner by replying to the person's message
• .addowner @mention
• .addowner 201234567890
• .addowner +970 569 225 114`)
      }

      const ownerNumber = targetUser.split("@")[0]

      if (global.owner.includes(ownerNumber)) {
        return m.reply(`⚠️ Number ${ownerNumber} is already an owner!`)
      }

      global.owner.push(ownerNumber)
      await updateConfigFile(global.owner)

      await conn.sendMessage(
        m.chat,
        {
          text: `✅ New owner added successfully

📱 Number: ${ownerNumber}
👤 User: @${ownerNumber}
👥 Total owners: ${global.owner.length}`,
          mentions: [targetUser]
        },
        { quoted: m }
      )

    } catch (err) {
      console.error("❌ Error in addowner command:", err)
      m.reply(`❌ Error: ${err.message}`)
    }
  }

  else if (command === 'حذف_مطور' || command === 'removeowner' || command === 'delowner') {
    if (!isOwner) return m.reply('❌ This command is for owners only')

    try {
      let targetNumber = null
      let targetIndex = -1

      if (m.quoted && m.quoted.sender) {
        targetNumber = m.quoted.sender.split("@")[0]
      }
      else if (m.mentionedJid && m.mentionedJid.length > 0) {
        targetNumber = m.mentionedJid[0].split("@")[0]
      }
      else if (args[0]) {
        const fullInput = args.join(" ")

        if (/^\d+$/.test(fullInput)) {
          const index = parseInt(fullInput) - 1
          if (index >= 0 && index < global.owner.length) {
            targetIndex = index
            targetNumber = global.owner[index]
          } else {
            return m.reply(`❌ Invalid index. Please enter a number between 1 and ${global.owner.length}`)
          }
        } else {
          targetNumber = fullInput.replace(/\D/g, "")
        }
      }

      if (!targetNumber && targetIndex === -1) {
        let ownerList = `👥 Current Bot Owners\n━━━━━━━━━━━━━━━━━━\n\n`

        for (let i = 0; i < global.owner.length; i++) {
          ownerList += `${i + 1}. +${global.owner[i]}\n`
        }

        ownerList += `\n━━━━━━━━━━━━━━━━━━\n`
        ownerList += `📌 Usage:\n`
        ownerList += `• .removeowner <index>\n`
        ownerList += `• .removeowner @mention\n`
        ownerList += `• .removeowner by replying to the person's message\n`
        ownerList += `• .removeowner 201234567890`

        return m.reply(ownerList)
      }

      if (targetIndex !== -1) {
        targetNumber = global.owner[targetIndex]
      }

      if (!global.owner.includes(targetNumber)) {
        return m.reply(`❌ Number ${targetNumber} is not in the owners list!`)
      }

      if (global.owner.length === 1) {
        return m.reply("⚠️ Cannot remove the last owner! At least one owner must remain.")
      }

      const index = global.owner.indexOf(targetNumber)
      global.owner.splice(index, 1)
      await updateConfigFile(global.owner)

      await conn.sendMessage(
        m.chat,
        {
          text: `✅ Owner removed successfully

📱 Removed number: ${targetNumber}
👤 User: @${targetNumber}
👥 Remaining owners: ${global.owner.length}`,
          mentions: [targetNumber + "@s.whatsapp.net"]
        },
        { quoted: m }
      )

    } catch (err) {
      console.error("❌ Error in removeowner command:", err)
      m.reply(`❌ Error: ${err.message}`)
    }
  }
}

async function updateConfigFile(ownersArray) {
  try {
    const configPath = './config.js'
    let configContent = fs.readFileSync(configPath, 'utf8')
    const ownerRegex = /global\.owner\s*=\s*\[(.*?)\]/s
    const match = configContent.match(ownerRegex)

    if (match) {
      const newOwnersString = ownersArray.map(num => `"${num}"`).join(', ')
      configContent = configContent.replace(ownerRegex, `global.owner = [${newOwnersString}]`)
    } else {
      configContent += `\n\n// Bot owners\nglobal.owner = [${ownersArray.map(num => `"${num}"`).join(', ')}]`
    }

    fs.writeFileSync(configPath, configContent, 'utf8')
    console.log(`✅ config.js updated successfully`)
    return true

  } catch (error) {
    console.error("❌ Error updating config.js:", error)
    throw new Error("Failed to update config file")
  }
}

handler.help = ['owners', 'addowner', 'removeowner']
handler.tags = ['owner']
handler.command = /^(المطورين|owners|listowner|المالكين|ضيف_مطور|addowner|حذف_مطور|removeowner|delowner)$/i

export default handler