// lib/level.js

function xpRange(level) {
  const min = level * level * 100
  const max = (level + 1) * (level + 1) * 100
  return { min, max }
}

function getLevel(exp) {
  if (exp <= 0) return 0
  let level = 0
  while (true) {
    const nextLevelExp = (level + 1) * (level + 1) * 100
    if (exp >= nextLevelExp) {
      level++
    } else {
      break
    }
  }
  return level
}

function getExpToNextLevel(level) {
  return (level + 1) * (level + 1) * 100
}

function getRemainingExp(exp, level) {
  const nextExp = (level + 1) * (level + 1) * 100
  return Math.max(0, nextExp - exp)
}

function getCurrentLevelExp(level) {
  return level * level * 100
}

function getProgressPercentage(exp, level) {
  const currentMin = getCurrentLevelExp(level)
  const nextMax = getExpToNextLevel(level)
  const progress = Math.max(0, exp - currentMin)
  const total = nextMax - currentMin
  if (total <= 0) return 100
  let percentage = (progress / total) * 100
  return Math.min(100, Math.max(0, Math.floor(percentage)))
}

function getRank(level) {
  if (level >= 80) return "🏆 Legend"
  if (level >= 70) return "💎 Mythic"
  if (level >= 60) return "⭐ Master"
  if (level >= 50) return "🌟 Expert"
  if (level >= 40) return "✨ Advanced"
  if (level >= 30) return "📚 Intermediate"
  if (level >= 20) return "📖 Learner"
  if (level >= 10) return "🌱 Beginner"
  if (level >= 5) return "🐣 Newbie"
  return "👶 Rookie"
}

function getRankDetails(level) {
  if (level >= 80) return { name: "أسطورة", emoji: "🏆", color: "#FFD700" }
  if (level >= 70) return { name: "أسطورة III", emoji: "⭐", color: "#FFA500" }
  if (level >= 60) return { name: "أسطورة IV", emoji: "💫", color: "#FF8C00" }
  if (level >= 50) return { name: "خبير I", emoji: "🌟", color: "#FFB347" }
  if (level >= 40) return { name: "خبير III", emoji: "✨", color: "#FFD700" }
  if (level >= 30) return { name: "متعلم I", emoji: "📚", color: "#98FB98" }
  if (level >= 25) return { name: "متعلم II", emoji: "📖", color: "#90EE90" }
  if (level >= 20) return { name: "متعلم III", emoji: "✏️", color: "#87CEEB" }
  if (level >= 15) return { name: "متعلم IV", emoji: "📝", color: "#7B68EE" }
  if (level >= 10) return { name: "متعلم V", emoji: "🎓", color: "#6A5ACD" }
  if (level >= 8) return { name: "مبتدئ I", emoji: "👨‍🎓", color: "#5F9EA0" }
  if (level >= 6) return { name: "مبتدئ II", emoji: "👩‍🎓", color: "#4682B4" }
  if (level >= 4) return { name: "مبتدئ III", emoji: "🧑‍🎓", color: "#3CB371" }
  if (level >= 2) return { name: "مبتدئ IV", emoji: "🌱", color: "#32CD32" }
  return { name: "مبتدئ V", emoji: "🐣", color: "#90EE90" }
}

function fixUserLevel(user) {
  if (!user) return 0
  const correctLevel = getLevel(user.exp || 0)
  if (user.level !== correctLevel) {
    user.level = correctLevel
    return true
  }
  return false
}

export { 
  getRank, 
  getLevel, 
  xpRange, 
  getRankDetails,
  getExpToNextLevel,
  getRemainingExp,
  getCurrentLevelExp,
  getProgressPercentage,
  fixUserLevel
}