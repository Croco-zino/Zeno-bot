let handler = async (m, { conn }) => {
const before = process.memoryUsage()

        const beforeUsed = (
            before.heapUsed / 1024 / 1024
        ).toFixed(2)

        if (global.userCache?.flushAll) {
            global.userCache.flushAll()
        }
        if (global.msgRetryCounterCache?.flushAll) {
            global.msgRetryCounterCache.flushAll()
        }
        if (global.userDevicesCache?.flushAll) {
            global.userDevicesCache.flushAll()
        }
        if (global.db?.data?.messages) {
            global.db.data.messages = {}
        }
        if (global.gc) {
            global.gc()
        }
        const after = process.memoryUsage()
        const afterUsed = (
            after.heapUsed / 1024 / 1024
        ).toFixed(2)
        const freed = (
            beforeUsed - afterUsed
        ).toFixed(2)

        const text = `
╭━━━〔 🧹 MEMORY CLEANED 〕━━━⬣

┃ 💾 before:
┃ ${beforeUsed} MB

┃ 💾 after:
┃ ${afterUsed} MB

┃ ⚡ freed:
┃ ${freed} MB

┃ 🧠 Cache:
┃ cleaned

┃ 🗑️ Messages:
┃ cleared

╰━━━━━━━━━━━━━━━━⬣
`.trim()

        await conn.sendMessage(m.chat, {
            text
        }, { quoted: m })

        await conn.sendMessage(m.chat, {
            react: {
                text: "🧹",
                key: m.key
            }
        }).catch(() => {})
};

handler.help = ["clearmemory","cmem","cleanram"];
handler.tags = ["owner"];
handler.owner = true;
handler.command = /^(clearmemory|cmem|cleanram|memory)$/i;

export default handler;