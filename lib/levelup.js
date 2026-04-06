// lib/levelup.js
import { getRankDetails } from "./level.js"

const defaultImages = [
  "https://telegra.ph/file/8e5e6f3b2d9c4a7b1e2f3.jpg",
  "https://telegra.ph/file/7d4c3b2a1e5f6g7h8i9j0.jpg",
  "https://telegra.ph/file/6c5b4a3d2e1f0g9h8i7j.jpg"
]

export async function checkAndSendLevelUp(conn, m, user) {
  if (!user) return false
  
  const oldLevel = user.level || 0
  const newLevel = (() => {
    let level = 0
    while ((level + 1) * (level + 1) * 100 <= (user.exp || 0)) level++
    return level
  })()
  
  if (newLevel > oldLevel) {
    user.level = newLevel
    const rankDetails = getRankDetails(newLevel)
    const rewardCoins = newLevel * 50
    
    user.coin = (user.coin || 0) + rewardCoins
    
    let profilePic = defaultImages[0]
    try {
      const pp = await conn.profilePictureUrl(m.sender, 'image').catch(() => null)
      if (pp) profilePic = pp
    } catch (e) {}
    
    const messages = [
      `*❍━━━══━━❪🌸❫━━══━━━❍*\n「✨ مبروك على المستوى الجديد 🆙🎉 」\n*❍━━━══━━❪🌸❫━━══━━━❍*\nمبروك، لقد وصلت إلى مستوى جديد، استمر على هذا النحو! 💪\n\n*• المستوى:* ${oldLevel} ⟿ ${newLevel}\n*• الرتبة:* ${rankDetails.name} ${rankDetails.emoji}\n*• المكافأة:* +${rewardCoins} كوين\n\n_*لرؤية نقاطك بشكل مباشر، استخدم الأمر .بروفايل*_\n*❍━━━══━━❪🌸❫━━══━━━❍*`,
      
      `@${m.sender.split('@')[0]} واو، لقد وصلت إلى مستوى جديد! 👏\n*• المستوى:* ${oldLevel} ⟿ ${newLevel}\n*• الرتبة:* ${rankDetails.name} ${rankDetails.emoji}\n*• المكافأة:* +${rewardCoins} كوين\n\n_*لرؤية ترتيب اللاعبين، استخدم الأمر .بروفايل*_\n*❍━━━══━━❪🌸❫━━══━━━❍*`,
      
      `ما شاء الله @${m.sender.split('@')[0]}، لقد حققت إنجازًا كبيرًا! 🙌\n\n*• المستوى الجديد:* ${newLevel}\n*• المستوى السابق:* ${oldLevel}\n*• الرتبة:* ${rankDetails.name} ${rankDetails.emoji}\n*• المكافأة:* +${rewardCoins} كوين\n*❍━━━══━━❪🌸❫━━══━━━❍*`
    ]
    
    await conn.sendMessage(m.chat, {
      text: messages[Math.floor(Math.random() * messages.length)],
      mentions: [m.sender]
    }, { quoted: m })
    
    await global.saveDatabase()
    return true
  }
  return false
}