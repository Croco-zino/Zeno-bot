import fs from "fs"

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
      configContent += `\n\n// مطورين البوت\nglobal.owner = [${ownersArray.map(num => `"${num}"`).join(', ')}]`
    }

    fs.writeFileSync(configPath, configContent, 'utf8')
    console.log(`✅ تم تحديث ملف config.js بنجاح`)
    return true

  } catch (error) {
    console.error("❌ خطأ في تحديث ملف config.js:", error)
    throw new Error("فشل في تحديث ملف الإعدادات")
  }
}

export const listCommand = {
  command: ["المطورين", "owners", "listowner", "المالكين"],
  description: "عرض قائمة مطوري البوت",
  owner: false,

  async execute(m, { conn }) {
    try {
      if (!global.owner || global.owner.length === 0) {
        return conn.sendMessage(
          m.chat,
          { 
            text: "⚠️ *لا يوجد مطورين مسجلين حالياً*\n\n" +
                  "يمكن إضافة مطور جديد باستخدام أمر:\n" +
                  "`.ضيف_مطور @منشن` أو بالرد على رسالة الشخص"
          },
          { quoted: m }
        )
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
        console.error("خطأ في قراءة ملف config:", readError)
      }

      let ownerList = `👥 *قائمة مطوري البوت*\n`
      ownerList += `━━━━━━━━━━━━━━━━━━\n\n`
      
      const sortedOwners = [...global.owner].sort()
      
      for (let i = 0; i < sortedOwners.length; i++) {
        ownerList += `${i + 1}. +${sortedOwners[i]}\n`
      }
      
      ownerList += `\n━━━━━━━━━━━━━━━━━━\n`
      ownerList += `📊 *الإجمالي:* ${global.owner.length} مطور`

      const mentions = global.owner.map(owner => owner + "@s.whatsapp.net")

      await conn.sendMessage(
        m.chat,
        { 
          text: ownerList,
          mentions: mentions,
          contextInfo: {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: "120363317350797803@newsletter",
              newsletterName: "⚡ CROCO BOT 🧸",
              serverMessageId: -1
            }
          }
        },
        { quoted: m }
      )

    } catch (err) {
      console.error("❌ خطأ في أمر المطورين:", err)
      await conn.sendMessage(
        m.chat,
        { text: `❌ حدث خطأ: ${err.message}` },
        { quoted: m }
      )
    }
  }
}

export const addCommand = {
  command: ["ضيف_مطور", "addowner"],
  description: "إضافة مطور جديد للبوت (بالرد أو المنشن)",
  owner: true,

  async execute(m, { conn, args }) {
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
        return conn.sendMessage(
          m.chat,
          { 
            text: "❌ *طريقة الاستخدام:*\n" +
                  "• .ضيف_مطور بالرد على رسالة الشخص\n" +
                  "• .ضيف_مطور @منشن\n" +
                  "• .ضيف_مطور 201234567890\n" +
                  "• .ضيف_مطور +970 569 225 114"
          },
          { quoted: m }
        )
      }

      const ownerNumber = targetUser.split("@")[0]

      if (global.owner.includes(ownerNumber)) {
        return conn.sendMessage(
          m.chat,
          { text: `⚠️ *الرقم ${ownerNumber} مطور بالفعل!*` },
          { quoted: m }
        )
      }

      global.owner.push(ownerNumber)
      await updateConfigFile(global.owner)

      await conn.sendMessage(
        m.chat,
        { 
          text: `✅ *تمت إضافة مطور جديد بنجاح*\n\n` +
                `📱 *الرقم:* ${ownerNumber}\n` +
                `👤 *اليوزر:* @${ownerNumber}\n` +
                `👥 *إجمالي المطورين:* ${global.owner.length}`,
          mentions: [targetUser]
        },
        { quoted: m }
      )

    } catch (err) {
      console.error("❌ خطأ في أمر ضيف_مطور:", err)
      await conn.sendMessage(
        m.chat,
        { text: `❌ حدث خطأ: ${err.message}` },
        { quoted: m }
      )
    }
  }
}

export const removeCommand = {
  command: ["حذف_مطور", "removeowner", "delowner"],
  description: "حذف مطور من قائمة المطورين (عبر الرقم أو الرد أو المنشن)",
  owner: true,

  async execute(m, { conn, args }) {
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
            return conn.sendMessage(
              m.chat,
              { text: `❌ الرقم التسلسلي غير صحيح. الرجاء إدخال رقم بين 1 و ${global.owner.length}` },
              { quoted: m }
            )
          }
        } else {
          targetNumber = fullInput.replace(/\D/g, "")
        }
      }

      if (!targetNumber && targetIndex === -1) {
        let ownerList = `👥 *قائمة مطوري البوت الحاليين*\n`
        ownerList += `━━━━━━━━━━━━━━━━━━\n\n`
        
        for (let i = 0; i < global.owner.length; i++) {
          ownerList += `${i + 1}. +${global.owner[i]}\n`
        }
        
        ownerList += `\n━━━━━━━━━━━━━━━━━━\n`
        ownerList += `📌 *طريقة الاستخدام:*\n`
        ownerList += `• .حذف_مطور الرقم التسلسلي\n`
        ownerList += `• .حذف_مطور @منشن\n`
        ownerList += `• .حذف_مطور بالرد على رسالة الشخص\n`
        ownerList += `• .حذف_مطور 201234567890`

        return conn.sendMessage(
          m.chat,
          { text: ownerList },
          { quoted: m }
        )
      }

      if (targetIndex !== -1) {
        targetNumber = global.owner[targetIndex]
      }

      if (!global.owner.includes(targetNumber)) {
        return conn.sendMessage(
          m.chat,
          { text: `❌ الرقم ${targetNumber} غير موجود في قائمة المطورين!` },
          { quoted: m }
        )
      }

      if (global.owner.length === 1) {
        return conn.sendMessage(
          m.chat,
          { text: "⚠️ لا يمكن حذف آخر مطور! يجب أن يبقى مطور واحد على الأقل." },
          { quoted: m }
        )
      }

      const index = global.owner.indexOf(targetNumber)
      global.owner.splice(index, 1)
      await updateConfigFile(global.owner)

      await conn.sendMessage(
        m.chat,
        { 
          text: `✅ *تم حذف المطور بنجاح*\n\n` +
                `📱 *الرقم المحذوف:* ${targetNumber}\n` +
                `👤 *اليوزر:* @${targetNumber}\n` +
                `👥 *المطورين المتبقين:* ${global.owner.length}`,
          mentions: [targetNumber + "@s.whatsapp.net"]
        },
        { quoted: m }
      )

    } catch (err) {
      console.error("❌ خطأ في أمر حذف_مطور:", err)
      await conn.sendMessage(
        m.chat,
        { text: `❌ حدث خطأ: ${err.message}` },
        { quoted: m }
      )
    }
  }
}

export default {
  command: ["المطورين", "ضيف_مطور", "حذف_مطور", "owners", "addowner", "delowner"],
  description: "أوامر إدارة مطوري البوت",
  owner: false,
  
  async execute(m, { conn, args, command }) {
    if (["المطورين", "owners", "listowner", "المالكين"].includes(command)) {
      return listCommand.execute(m, { conn, args })
    } else if (["ضيف_مطور", "addowner"].includes(command)) {
      return addCommand.execute(m, { conn, args })
    } else if (["حذف_مطور", "removeowner", "delowner"].includes(command)) {
      return removeCommand.execute(m, { conn, args })
    }
  }
}