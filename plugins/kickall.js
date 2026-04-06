// plugins/kickall.js
export default {
    command: ['kickall', 'فنش'],
    description: 'Kick all members from group',
    
    async execute(m, { conn }) {
        const chat = m.chat
        const sender = m.sender
        const groupMetadata = await conn.groupMetadata(chat)
        const participants = groupMetadata.participants || []
        const groupAdmins = participants.filter(p => p.admin).map(p => p.id)
        const developers = (global.owner || []).map(num => num + '@s.whatsapp.net')

        const botNumber = conn.user.jid
        const exceptions = [
            botNumber, 
            sender,
            ...developers,
            ...groupAdmins
        ]
        const toKick = participants
            .map(p => p.id)
            .filter(id => !exceptions.includes(id))
        
        if (toKick.length === 0) {
            return conn.sendMessage(chat, { 
                text: '❌ لا يوجد أعضاء لطردهم!\n' +
                      `• إجمالي الأعضاء: ${participants.length}`
            }, { quoted: m })
        }

            try {
                const batchSize = 600
                let success = 0
                let failed = 0
                let failedList = []
                
                for (let i = 0; i < toKick.length; i += batchSize) {
                    const batch = toKick.slice(i, i + batchSize)
                    try {
                        await conn.groupParticipantsUpdate(chat, batch, 'remove')
                        success += batch.length
                        
                        await conn.sendMessage(chat, { 
                            text: `📊 تم طرد ${success} من ${toKick.length} عضو...` 
                        }, { quoted: m })
                        
                        await new Promise(resolve => setTimeout(resolve, 400))
                        
                    } catch (err) {
                        console.error(`Failed to kick batch:`, err)
                        failed += batch.length
                        failedList.push(...batch)
                    }
                }
            } catch (err) {
                console.error('Fatal error in kick all:', err)
                await conn.sendMessage(chat, { 
                    text: '❌ حدث خطأ غير متوقع أثناء الطرد'
                }, { quoted: m })
            }
    }
}