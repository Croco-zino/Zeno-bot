import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'
import { fileTypeFromBuffer as fromBuffer } from 'file-type'
import { addExif } from '../lib/sticker.js'
import { exec } from 'child_process'
import util from 'util'

const execPromise = util.promisify(exec)

function isUrl(text) {
    return /^https?:\/\/\S+\.(jpg|jpeg|png|gif|webp)$/i.test(text)
}

async function checkFFmpeg() {
    try {
        await execPromise('ffmpeg -version')
        return true
    } catch {
        return false
    }
}

function unwrapMessage(msg) {
    if (!msg) return msg
    if (msg.viewOnceMessage) {
        return unwrapMessage(msg.viewOnceMessage.message)
    }
    if (msg.ephemeralMessage) {
        return unwrapMessage(msg.ephemeralMessage.message)
    }
    return msg
}

async function toWebpWithExec(buffer) {
    const { ext } = await fromBuffer(buffer)
    if (!/(png|jpg|jpeg|mp4|mkv|gif|webp|webm)/i.test(ext)) {
        throw new Error('Unsupported media!')
    }

    const tempDir = './tmp'
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir)

    const input = path.join(tempDir, `${Date.now()}.${ext}`)
    const output = path.join(tempDir, `${Date.now()}.webp`)

    fs.writeFileSync(input, buffer)

    try {
        let cmd = `ffmpeg -i "${input}"`

        if (/(mp4|mkv|gif|webm)/i.test(ext)) {
            cmd += ` -vf "fps=15,scale=320:320:force_original_aspect_ratio=increase,crop=320:320" -vcodec libwebp -loop 0 -preset default -an -vsync 0 -t 20 -y "${output}"`
        } else {
            cmd += ` -vf "scale=320:320:force_original_aspect_ratio=increase,crop=320:320" -vcodec libwebp -y "${output}"`
        }

        await execPromise(cmd)

        const result = fs.readFileSync(output)

        fs.unlinkSync(input)
        fs.unlinkSync(output)

        return result

    } catch (e) {
        throw e
    }
}

async function getMediaBuffer(msg) {
    try {
        if (!msg) return null

        const unwrapped = unwrapMessage(msg.message || msg)

        if (typeof msg.download === 'function') {
            return await msg.download()
        }

        const media =
            unwrapped.imageMessage ||
            unwrapped.videoMessage ||
            unwrapped.stickerMessage

        if (!media) return null

        const { downloadContentFromMessage } = await import('baileys')

        const stream = await downloadContentFromMessage(
            media,
            media.mimetype?.includes('image') ? 'image' :
                media.mimetype?.includes('video') ? 'video' :
                    'sticker'
        )

        let buffer = Buffer.from([])
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk])
        }

        return buffer

    } catch (e) {
        console.error('Media download failed:', e)
        return null
    }
}

let handler = async (m, { conn, args, command }) => {
    const q = m.quoted || m
    let buffer

    try {
        const ok = await checkFFmpeg()
        if (!ok) {
            return conn.sendMessage(m.chat, {
                text: '❌ FFmpeg not installed\nTermux: pkg install ffmpeg'
            }, { quoted: m })
        }

        if (args[0] && isUrl(args[0])) {
            const res = await fetch(args[0])
            buffer = await res.buffer()
        }

        else {
            const duration =
                q.message?.videoMessage?.seconds ||
                q.msg?.seconds || 0

            if (duration > 20) {
                return conn.sendMessage(m.chat, {
                    text: '❌ Max video length is 20 seconds'
                }, { quoted: m })
            }

            buffer = await getMediaBuffer(q)

            if (!buffer && typeof q.download === 'function') {
                buffer = await q.download()
            }
        }

        if (!buffer) {
            return conn.sendMessage(m.chat, {
                text: `❌ Reply to media or send image URL`
            }, { quoted: m })
        }

        await conn.sendMessage(m.chat, {
            text: '🕓 Processing...'
        }, { quoted: m })

        const webp = await toWebpWithExec(buffer)

        const sticker = await addExif(
            webp,
            'Zeno Bot',
            'Croco'
        )

        await conn.sendMessage(m.chat, {
            sticker: sticker
        }, { quoted: m })

        await conn.sendMessage(m.chat, {
            text: '✅ Done'
        }, { quoted: m })

    } catch (e) {
        console.error(e)

        await conn.sendMessage(m.chat, {
            text: `❌ Error: ${e.message}`
        }, { quoted: m })
    }
}

handler.help = ["sticker", "s"]
handler.tags = ["stick"]
handler.description = "Create sticker"
handler.command = /^(ملصق|م|s|stick)$/i

export default handler
