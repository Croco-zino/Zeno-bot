async function allHandler(m, chatUpdate, conn) {
    conn = conn || chatUpdate?.conn || m?.conn || global.conn

    if (!conn || m.isBaileys || !m.message) return

    let id = null

    if (m.message.buttonsResponseMessage) {
        id = m.message.buttonsResponseMessage.selectedButtonId
    } else if (m.message.templateButtonReplyMessage) {
        id = m.message.templateButtonReplyMessage.selectedId
    } else if (m.message.listResponseMessage) {
        id = m.message.listResponseMessage.singleSelectReply?.selectedRowId
    } else if (m.message.interactiveResponseMessage) {
        try {
            const raw = m.message.interactiveResponseMessage
                .nativeFlowResponseMessage?.paramsJson
            if (raw) {
                const params = JSON.parse(raw)
                id = params.id || params.selectedId || params.selectedRowId
            }
        } catch {}
    } else {
        return
    }

    if (!id) return

    console.log('[BUTTON/LIST SELECTED]', id)

    const prefix = global.prefix || '.'
    const commandName = id.startsWith(prefix) ? id.slice(prefix.length) : id

    const plugins = global.plugins || {}

    for (const plugin of Object.values(plugins)) {
        if (!plugin || typeof plugin !== 'function' || !plugin.command) continue

        const cmd = plugin.command
        let isMatch = false

        if (cmd instanceof RegExp) {
            cmd.lastIndex = 0
            isMatch = cmd.test(commandName)
        } else if (typeof cmd === 'string') {
            isMatch = cmd === commandName
        } else if (Array.isArray(cmd)) {
            isMatch = cmd.some(c => {
                if (c instanceof RegExp) {
                    c.lastIndex = 0
                    return c.test(commandName)
                }
                return c === commandName
            })
        }

        if (!isMatch) continue

        try {
            await plugin.call(conn, m, {
                conn,
                command: commandName,
                text: '',
                args: [],
                usedPrefix: prefix
            })
            return
        } catch (e) {
            console.error('[_t.js] plugin exec error:', e.message)
            return
        }
    }

    console.log('[_t.js] no matching plugin for:', commandName)
}

const plugin = allHandler
plugin.all = allHandler

export default plugin