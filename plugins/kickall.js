let handler = async (m, { conn }) => {
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
                text: '❌ There are no members to kick!\n' +
                      `• Total members: ${participants.length}`
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
                            text: `📊 kick ${success} of ${toKick.length} members...`
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
                    text: '❌ error occurred while trying to kick members. Please check the console for details.'
                }, { quoted: m })
            }
};

handler.help = ["kickall","فنش"];
handler.tags = ["kickall"];
handler.owner = true;
handler.description = "Kick all members from group";
handler.command = /^(kickall|فنش)$/i;

export default handler;