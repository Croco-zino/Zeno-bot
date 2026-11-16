import syntaxError from 'syntax-error'
import util from 'util'
import { createRequire } from 'module'

const baileysModule = await import('baileys')
const baileys = baileysModule.default || baileysModule
const WAProto = baileys.WAProto || baileys.default?.WAProto
const require = createRequire(import.meta.url)
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

let handler = async (m, ctx = {}) => {
    const {
        conn, args, text, command, usedPrefix, user, chat, settings,
        participants, groupMetadata, isOwner, isROwner, isPrems, isOwners,
        isAdmin, isBotAdmin, dfail, getBuffer
    } = ctx

    if (!text?.trim()) return

    const vars = {
        m, handler, require, conn, process,
        args, text, command, usedPrefix,
        user, chat, settings,
        participants, groupMetadata,
        isOwner, isROwner, isPrems, isOwners,
        isAdmin, isBotAdmin,
        dfail, getBuffer,
        baileys, WAProto
    }

    let code = text.trim()
    let result
    let syntax = ''

    try {
        const names = Object.keys(vars)
        const values = Object.values(vars)

        if (!/^(const|let|var|if|for|while|switch|try|function|class|return|throw)\b/.test(code)) {
            code = `return (${code})`
        }

        const exec = new AsyncFunction(...names, code)
        result = await exec(...values)

    } catch (e) {
        const err = syntaxError(text, 'Eval', {
            allowReturnOutsideFunction: true,
            allowAwaitOutsideFunction: true
        })

        syntax = err ? `\`\`\`${err}\`\`\`\n\n` : ''
        result = e
    }

    const output = util.format(result)

    if (syntax || output !== 'undefined') {
        await m.reply(syntax + output)
    }
}

handler.customPrefix = /^=?> /
handler.rowner = true

export default handler