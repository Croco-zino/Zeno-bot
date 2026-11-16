
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

let handler = async (m, { conn, text } = {}) => {
    if (conn.user?.jid !== global.conn?.user?.jid) return

    const command = text?.trim()
    if (!command) return m.reply('❌ اكتب أمر بعد `$`')

    await m.reply('⏳ Executing...')

    try {
        const { stdout, stderr } = await execAsync(command, {
            timeout: 60000,
            maxBuffer: 10 * 1024 * 1024,
            windowsHide: true
        })

        let output = ''

        if (stdout?.trim()) {
            output += stdout.trim()
        }

        if (stderr?.trim()) {
            if (output) output += '\n\n'
            output += stderr.trim()
        }

        if (!output) {
            output = '✅ Done'
        }

        await m.reply(output)

    } catch (e) {
        let output = ''

        if (e?.stdout?.trim()) {
            output += e.stdout.trim()
        }

        if (e?.stderr?.trim()) {
            if (output) output += '\n\n'
            output += e.stderr.trim()
        }

        if (!output) {
            output = e?.message || String(e)
        }

        await m.reply(output.trim())
    }
}

handler.customPrefix = /^\$ /
handler.rowner = true

export default handler