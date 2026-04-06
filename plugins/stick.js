import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'
import fluent from 'fluent-ffmpeg'
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

async function toWebpWithExec(buffer, opts = {}) {
    const { ext } = await fromBuffer(buffer)
    if (!/(png|jpg|jpeg|mp4|mkv|m4p|gif|webp|webm)/i.test(ext)) throw 'Unsupported media!'

    const tempDir = global.tempDir || './tmp'
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir)

    const input = path.join(tempDir, `${Date.now()}.${ext}`)
    const output = path.join(tempDir, `${Date.now()}.webp`)
    fs.writeFileSync(input, buffer)

    try {
        let ffmpegCmd = `ffmpeg -i "${input}"`
        
        if (ext.match(/(mp4|mkv|m4p|gif|webm)/)) {
            ffmpegCmd += ` -vf "fps=15,scale=320:320:force_original_aspect_ratio=increase,crop=320:320" -vcodec libwebp -loop 0 -preset default -an -vsync 0 -t 20 -y "${output}"`
        } else {
            const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${input}"`
            const probeResult = await execPromise(probeCmd)
            const [width, height] = probeResult.stdout.trim().split(',').map(Number)
            
            console.log(`Image dimensions: ${width}x${height}`)
            if (width > height) {
                ffmpegCmd += ` -vf "scale=320:320:force_original_aspect_ratio=increase,crop=320:320" -vcodec libwebp -y "${output}"`
            } else if (height > width) {
                ffmpegCmd += ` -vf "scale=320:320:force_original_aspect_ratio=increase,crop=320:320" -vcodec libwebp -y "${output}"`
            } else {
                ffmpegCmd += ` -vf "scale=320:320" -vcodec libwebp -y "${output}"`
            }
        }
        
        console.log('Executing FFmpeg command:', ffmpegCmd)
        await execPromise(ffmpegCmd)
        
        if (!fs.existsSync(output)) {
            throw new Error('Output file not created')
        }
        
        const result = fs.readFileSync(output)

        if (fs.existsSync(input)) fs.unlinkSync(input)
        if (fs.existsSync(output)) fs.unlinkSync(output)
        
        return result
    } catch (error) {
        console.error('FFmpeg exec error:', error)
        try {
            console.log('Trying alternative crop method...')
            const simpleCmd = `ffmpeg -i "${input}" -vf "crop=min(iw\\,ih):min(iw\\,ih),scale=320:320" -vcodec libwebp -y "${output}"`
            await execPromise(simpleCmd)
            
            if (fs.existsSync(output)) {
                const result = fs.readFileSync(output)
                if (fs.existsSync(input)) fs.unlinkSync(input)
                if (fs.existsSync(output)) fs.unlinkSync(output)
                return result
            }
        } catch (secondError) {
            console.error('Alternative filter also failed:', secondError)
        }
        throw error
    }
}
function hasMediaInMessage(msg) {
    if (!msg) return false
    
    const message = msg.message || msg
    
    const mediaTypes = [
        'imageMessage',
        'videoMessage',
        'stickerMessage',
        'documentMessage'
    ]
    
    for (const type of mediaTypes) {
        if (message[type]) return true
        if (message.extendedTextMessage?.contextInfo?.quotedMessage?.[type]) return true
    }
    
    if (message.mimetype) return true
    if (msg.mimetype) return true
    if (msg.mediaType) return true
    
    return false
}
async function getMediaBuffer(msg) {
    try {
        if (typeof msg.download === 'function') {
            return await msg.download()
        }
        
        const message = msg.message || msg
        let mediaMessage = null
        
        if (message.imageMessage) mediaMessage = message.imageMessage
        else if (message.videoMessage) mediaMessage = message.videoMessage
        else if (message.stickerMessage) mediaMessage = message.stickerMessage
        else if (message.documentMessage) mediaMessage = message.documentMessage
        else if (message.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quoted = message.extendedTextMessage.contextInfo.quotedMessage
            if (quoted.imageMessage) mediaMessage = quoted.imageMessage
            else if (quoted.videoMessage) mediaMessage = quoted.videoMessage
            else if (quoted.stickerMessage) mediaMessage = quoted.stickerMessage
        }
        
        if (mediaMessage) {
            const { downloadContentFromMessage } = await import('@whiskeysockets/baileys')
            const stream = await downloadContentFromMessage(mediaMessage, 
                mediaMessage.imageMessage ? 'image' : 
                mediaMessage.videoMessage ? 'video' : 
                'sticker')
            
            let buffer = Buffer.from([])
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk])
            }
            return buffer
        }
        
        return null
    } catch (e) {
        console.error('Error getting media buffer:', e)
        return null
    }
}

export default {
    command: ['ستيكر', 'ملصق', 's'],
    async execute(m, { conn, args, command }) {
        const q = m.quoted ? m.quoted : m
        
        let buffer

        try {
            const hasFFmpeg = await checkFFmpeg()
            if (!hasFFmpeg) {
                return conn.sendMessage(m.chat, { 
                    text: '❌ FFmpeg is not installed. Please install FFmpeg first:\n- Termux: pkg install ffmpeg\n- Linux: sudo apt install ffmpeg'
                }, { quoted: m })
            }
            if (args[0] && isUrl(args[0])) {
                const res = await fetch(args[0])
                buffer = await res.buffer()
            } 
            else if (hasMediaInMessage(q)) {
                const videoDuration = q.message?.videoMessage?.seconds || q.msg?.seconds || 0
                if (videoDuration > 20) {
                    return conn.sendMessage(m.chat, { text: '❌ Animated sticker cannot be longer than 20 seconds!' }, { quoted: m })
                }
                
                buffer = await getMediaBuffer(q)
                if (!buffer && typeof q.download === 'function') {
                    buffer = await q.download()
                }
            }
            
            if (!buffer) {
                let helpText = `❌ Please reply to an image/video/sticker or provide a direct image URL.\n\n`
                helpText += `*Examples:*\n`
                helpText += `• ${command} (reply to image)\n`
                helpText += `• ${command} https://example.com/image.jpg\n\n`
                helpText += `*Supported formats:*\n`
                helpText += `• Images: JPG, PNG, GIF\n`
                helpText += `• Videos: MP4, MKV (max 20 seconds)`
                
                return conn.sendMessage(m.chat, { text: helpText }, { quoted: m })
            }
            await conn.sendMessage(m.chat, { text: '🕓 Processing your sticker...' }, { quoted: m })
            const stickerData = await toWebpWithExec(buffer)
            const finalSticker = await addExif(
                stickerData,
                `Zeno Bot`,
                `Croco`
            )
            await conn.sendMessage(
                m.chat,
                { sticker: finalSticker },
                { quoted: m }
            )

            await conn.sendMessage(m.chat, { text: '✅ Sticker created successfully!' }, { quoted: m })

        } catch (e) {
            console.error('Sticker creation error:', e)
            let errorMessage = '❌ Failed to create sticker.\n\n'
            
            if (e.message?.includes('Unsupported media')) {
                errorMessage = '❌ Unsupported media type. Please send an image, video, or sticker.'
            } else if (e.message?.includes('FFmpeg')) {
                errorMessage += 'FFmpeg error. Make sure it\'s installed correctly.'
            } else if (e.message?.includes('fetch')) {
                errorMessage = '❌ Failed to download image from URL. Make sure the URL is valid.'
            } else {
                errorMessage += `Error: ${e.message || 'Unknown error'}`
            }
            
            await conn.sendMessage(m.chat, { text: errorMessage }, { quoted: m })
        }
    }
}