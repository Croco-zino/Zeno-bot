// plugins/profile.js
import { 
  getRank, 
  getRankDetails, 
  getLevel, 
  getRemainingExp, 
  getProgressPercentage, 
  getExpToNextLevel,
  fixUserLevel
} from "../lib/level.js"

export default {
  command: ["profile", "بروفايل", "p", "info"],
  description: "عرض بيانات المستخدم",
  category: "General",
  
  execute: async (m, { conn, user, args, isGroup }) => {
    let target = m.sender
    let targetUser = user
    let targetName = user.name || m.pushName
    if (isGroup && args[0] && args[0].startsWith('@')) {
      target = args[0].replace('@', '') + '@s.whatsapp.net'
      targetUser = global.db.data.users[target]
      if (!targetUser) {
        return m.reply(`❌ المستخدم غير موجود في قاعدة البيانات!`)
      }
      targetName = targetUser.name || args[0].replace('@', '')
    }
    else if (isGroup && m.quoted && m.quoted.sender) {
      target = m.quoted.sender
      targetUser = global.db.data.users[target]
      if (!targetUser) {
        return m.reply(`❌ المستخدم غير موجود في قاعدة البيانات!`)
      }
      targetName = targetUser.name || m.quoted.pushName || "مستخدم"
    }
    const wasFixed = fixUserLevel(targetUser)
    if (wasFixed) {
      await global.saveDatabase()
    }
    
    const exp = targetUser.exp || 0
    const level = targetUser.level || 0
    const rankDetails = getRankDetails(level)
    const nextExp = getExpToNextLevel(level)
    const remainingExp = getRemainingExp(exp, level)
    const progressPercentage = getProgressPercentage(exp, level)
    const progressBarLength = 15
    let filledBars = Math.floor((progressPercentage / 100) * progressBarLength)
    filledBars = Math.min(progressBarLength, Math.max(0, filledBars))
    const emptyBars = progressBarLength - filledBars
    const progressBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars)
    const commandsUsed = targetUser.commands || 0
    const coins = targetUser.coin || 0
    const bank = targetUser.bank || 0
    const warnings = targetUser.warn || 0
    
    const message = `╭━━━〔 👤 *بروفايل* 〕━━━⬣
┃
┃ ✨ *الاسم:* ${targetName}
┃ 🆔 *الرقم:* ${target.split('@')[0]}
┃
┃ 🏆 *الرتبة:* ${rankDetails.emoji} ${rankDetails.name}
┃ 📊 *المستوى:* ${level}
┃ ⚡ *الخبرة:* ${exp.toLocaleString()} / ${nextExp.toLocaleString()} XP
┃
┃ 📈 *التقدم:* ${progressBar} ${progressPercentage}%
┃ 🎯 *المطلوب:* ${remainingExp.toLocaleString()} XP
┃
┃ 🪙 *الرصيد:* ${coins.toLocaleString()} كوين
┃ 🏦 *البنك:* ${bank.toLocaleString()} كوين
┃
┃ ⚔️ *الأوامر:* ${commandsUsed.toLocaleString()}
┃ ⚠️ *التحذيرات:* ${warnings}
┃
╰━━━━━━━━━━━━━━━━━━⬣`

    m.reply(message)
  }
}