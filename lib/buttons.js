const baileys = await import('baileys')
import { randomBytes, createHash } from 'crypto'
const { generateWAMessageFromContent, generateWAMessage, prepareWAMessageMedia, proto } = baileys
import { MB } from 'cro-mb-lib'

const make = (name, params) => ({ name, buttonParamsJson: JSON.stringify(params) })

export const btn = {
    reply: (text, id) => make('quick_reply', { display_text: text, id }),
    url: (text, url) => make('cta_url', { display_text: text, url, merchant_url: url }),
    copy: (text, code) => make('cta_copy', { display_text: text, id: code, copy_code: code }),
    call: (text, phone) => make('cta_call', { display_text: text, phone_number: phone }),
    list: (title, sections) => make('single_select', { title, sections }),
    location: (text = '📍 Send Location') => make('send_location', { display_text: text }),
    reminder: (text, id) => make('cta_reminder', { display_text: text, id }),
    cancelReminder: (text, id) => make('cta_cancel_reminder', { display_text: text, id }),
    address: (text, id) => make('address_message', { display_text: text, id }),
    flow: (text, flowId, payload = {}) => make('galaxy_message', {
        flow_message_version: '3',
        flow_token: 'unused',
        flow_id: flowId,
        flow_cta: text,
        flow_action: 'navigate',
        flow_action_payload: { screen: 'WELCOME_SCREEN', ...payload },
    }),
    custom: (name, params) => make(name, params),
}

const buildNodes = (jid) => {
    const nodes = [
        {
            tag: 'biz',
            attrs: {},
            content: [
                {
                    tag: 'interactive',
                    attrs: { type: 'native_flow', v: '1' },
                    content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
                },
            ],
        },
    ]
    if (!jid.endsWith('@g.us') && global.btnBotNode === true) nodes.push({ tag: 'bot', attrs: { biz_bot: '1' } })
    return nodes
}

const sha256 = (buf) => createHash('sha256').update(buf).digest()

const newMsgId = (conn) =>
    baileys.generateMessageIDV2?.(conn.user?.id) || '3EB0' + randomBytes(9).toString('hex').toUpperCase()

const mediaPollOptionHash = (optionName, fileSha256) => {
    const nameHash = sha256(Buffer.from(optionName, 'utf8')).toString('hex')
    const fileB64 = Buffer.from(fileSha256).toString('base64')
    return sha256(Buffer.from(nameHash + fileB64, 'utf8')).toString('hex')
}

export const sendButtons = async (conn, jid, opts = {}, quoted) => {
    const { title, subtitle, body, footer, buttons = [], image, video } = opts

    if (!buttons.length) throw new Error('sendButtons: at least one button is required')

    const interactiveMessage = {
        body: { text: body || ' ' },
        nativeFlowMessage: { buttons, messageParamsJson: '' },
    }
    if (footer) interactiveMessage.footer = { text: footer }

    if (image || video) {
        const src = image || video
        const media = await prepareWAMessageMedia(
            image ? { image: Buffer.isBuffer(src) ? src : src } : { video: src },
            { upload: conn.waUploadToServer }
        )
        interactiveMessage.header = {
            title: title || '',
            subtitle: subtitle || '',
            hasMediaAttachment: true,
            ...(image ? { imageMessage: media.imageMessage } : { videoMessage: media.videoMessage }),
        }
    } else if (title || subtitle) {
        interactiveMessage.header = {
            title: title || '',
            subtitle: subtitle || '',
            hasMediaAttachment: false,
        }
    }

    const msg = generateWAMessageFromContent(
        jid,
        {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                    interactiveMessage,
                },
            },
        },
        { userJid: conn.user.id, quoted }
    )

    await conn.relayMessage(jid, msg.message, {
        messageId: msg.key.id,
        additionalNodes: buildNodes(jid),
    })
    return msg
}

export const sendList = (conn, jid, { title, body, footer, buttonText = '📋 Show Options', sections }, quoted) =>
    sendButtons(conn, jid, { title, body, footer, buttons: [btn.list(buttonText, sections)] }, quoted)

export const sendQuickReplies = (conn, jid, { title, body, footer, options }, quoted) =>
    sendButtons(conn, jid, {
        title, body, footer,
        buttons: options.map(([text, id]) => btn.reply(text, id)),
    }, quoted)

export const sendUrlButtons = (conn, jid, { title, body, footer, links }, quoted) =>
    sendButtons(conn, jid, {
        title, body, footer,
        buttons: links.map(([text, url]) => btn.url(text, url)),
    }, quoted)

export const sendCards = async (conn, jid, { title, body, footer, cards = [] }, quoted) => {
    if (!cards.length) throw new Error('sendCards: at least one card is required')

    const builtCards = []
    for (const c of cards) {
        const card = {
            body: { text: c.body || ' ' },
            nativeFlowMessage: { buttons: c.buttons || [], messageParamsJson: '' },
        }
        if (c.footer) card.footer = { text: c.footer }

        if (c.image) {
            const media = await prepareWAMessageMedia({ image: c.image }, { upload: conn.waUploadToServer })
            card.header = { title: c.title || '', hasMediaAttachment: true, imageMessage: media.imageMessage }
        } else {
            card.header = { title: c.title || '', hasMediaAttachment: false }
        }
        builtCards.push(card)
    }

    const interactiveMessage = {
        body: { text: body || ' ' },
        carouselMessage: { cards: builtCards, messageVersion: 1 },
    }
    if (title) interactiveMessage.header = { title, hasMediaAttachment: false }
    if (footer) interactiveMessage.footer = { text: footer }

    const msg = generateWAMessageFromContent(
        jid,
        {
            viewOnceMessage: {
                message: {
                    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                    interactiveMessage,
                },
            },
        },
        { userJid: conn.user.id, quoted }
    )

    await conn.relayMessage(jid, msg.message, {
        messageId: msg.key.id,
        additionalNodes: buildNodes(jid),
    })
    return msg
}

export const sendPoll = (conn, jid, { name, options, multiple = false }, quoted) =>
    conn.sendMessage(
        jid,
        { poll: { name, values: options, selectableCount: multiple ? options.length : 1 } },
        { quoted }
    )

export const sendViewOnce = async (conn, jid, { type = 'image', media, caption, mode = 'v2', meta = true }, quoted) => {
    const key = `${type}Message`
    const inner = await prepareWAMessageMedia({ [type]: media }, { upload: conn.waUploadToServer })
    inner[key].viewOnce = true
    if (caption && type !== 'audio') inner[key].caption = caption

    const content = mode === 'flat' ? inner : { viewOnceMessageV2: { message: inner } }
    const nodes = meta ? [{ tag: 'meta', attrs: { view_once: 'true' } }] : undefined
    return relay(conn, jid, content, quoted, nodes)
}

const relay = async (conn, jid, content, quoted, additionalNodes) => {
    const msg = generateWAMessageFromContent(jid, content, { userJid: conn.user.id, quoted })
    await conn.relayMessage(jid, msg.message, {
        messageId: msg.key.id,
        ...(additionalNodes ? { additionalNodes } : {}),
    })
    return msg
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const toUnix = (d) => Math.floor(new Date(d).getTime() / 1000)

export const sendAlbum = async (conn, jid, { items, caption, delay = 500 }, quoted) => {
    if (!items?.length) throw new Error('sendAlbum: at least one item is required')
    const parent = await relay(conn, jid, {
        albumMessage: {
            expectedImageCount: items.filter((i) => i.image).length,
            expectedVideoCount: items.filter((i) => i.video).length,
        },
    }, quoted)

    for (const [i, item] of items.entries()) {
        const content = { ...item }
        if (i === 0 && caption && !content.caption) content.caption = caption
        const msg = await generateWAMessage(jid, content, {
            upload: conn.waUploadToServer,
            userJid: conn.user.id,
        })
        msg.message.messageContextInfo = {
            messageAssociation: { associationType: 1, parentMessageKey: parent.key },
        }
        await conn.relayMessage(jid, msg.message, { messageId: msg.key.id })
        await sleep(delay)
    }
    return parent
}

export const sendEvent = (conn, jid, { name, description, startTime, endTime, location, call, allowGuests = true }, quoted) => {
    const loc = location && (typeof location === 'string' ? { name: location } : location)
    const event = {
        name,
        description,
        startDate: new Date(startTime),
        extraGuestsAllowed: allowGuests,
        ...(endTime ? { endDate: new Date(endTime) } : {}),
        ...(call ? { call } : {}),
        ...(loc ? {
            location: {
                name: loc.name,
                degreesLatitude: loc.lat || 0,
                degreesLongitude: loc.lng || 0,
            },
        } : {}),
    }
    return conn.sendMessage(jid, { event }, { quoted })
}

export const sendContact = (conn, jid, { name, contacts }, quoted) => {
    const list = contacts.map((c) => {
        const num = String(c.number).replace(/\D/g, '')
        return {
            vcard:
                `BEGIN:VCARD\nVERSION:3.0\nFN:${c.name}\n` +
                (c.org ? `ORG:${c.org};\n` : '') +
                `TEL;type=CELL;type=VOICE;waid=${num}:+${num}\nEND:VCARD`,
        }
    })
    return conn.sendMessage(
        jid,
        { contacts: { displayName: name || contacts[0].name, contacts: list } },
        { quoted }
    )
}

export const sendLocation = (conn, jid, { lat, lng, name, address }, quoted) =>
    conn.sendMessage(
        jid,
        { location: { degreesLatitude: lat, degreesLongitude: lng, name, address } },
        { quoted }
    )

export const sendLiveLocation = (conn, jid, { lat, lng, caption = '' }, quoted) =>
    relay(conn, jid, {
        liveLocationMessage: {
            degreesLatitude: lat,
            degreesLongitude: lng,
            caption,
            sequenceNumber: Date.now(),
            timeOffset: 0,
        },
    }, quoted)

export const sendSticker = (conn, jid, { sticker }, quoted) =>
    conn.sendMessage(jid, { sticker }, { quoted })

export const sendReaction = (conn, jid, { key, emoji }) =>
    conn.sendMessage(jid, { react: { text: emoji, key } })

export const sendMention = (conn, jid, { text, mentions = [] }, quoted) =>
    conn.sendMessage(jid, { text, mentions }, { quoted })

export const forwardMessage = (conn, jid, { message }, quoted) =>
    conn.sendMessage(jid, { forward: message }, { quoted })

export const editMessage = (conn, jid, { key, text }) =>
    conn.sendMessage(jid, { text, edit: key })

export const deleteMessage = (conn, jid, { key }) =>
    conn.sendMessage(jid, { delete: key })

export const pinMessage = (conn, jid, { key, type = 1, time = 86400 }) =>
    conn.sendMessage(jid, { pin: key, type, time })

export const sendGroupInvite = async (conn, jid, { groupJid, caption = '' }, quoted) => {
    const [code, meta] = await Promise.all([
        conn.groupInviteCode(groupJid),
        conn.groupMetadata(groupJid),
    ])
    return relay(conn, jid, {
        groupInviteMessage: {
            groupJid,
            inviteCode: code,
            inviteExpiration: toUnix(Date.now() + 3 * 24 * 3600 * 1000),
            groupName: meta.subject,
            caption,
        },
    }, quoted)
}

export const sendAI = async (conn, jid, content, quoted) => {
    if (jid.endsWith('@g.us')) return conn.sendMessage(jid, content, { quoted })

    const msg = await generateWAMessage(jid, content, {
        userJid: conn.user.id,
        upload: conn.waUploadToServer,
        quoted,
    })
    msg.message.messageContextInfo = {
        ...(msg.message.messageContextInfo || {}),
        supportPayload: JSON.stringify({
            version: 2,
            is_ai_response: true,
            should_show_system_message: true,
            ticket_id: randomBytes(16).toString('hex'),
        }),
    }
    await conn.relayMessage(jid, msg.message, {
        messageId: msg.key.id,
        additionalNodes: [{ tag: 'bot', attrs: { biz_bot: '1' } }],
    })
    return msg
}

export const sendToChannel = (conn, channelJid, content) => {
    if (!channelJid.endsWith('@newsletter')) throw new Error('sendToChannel: jid must end with @newsletter')
    return conn.sendMessage(channelJid, content)
}

export const sendLegacyButtons = (conn, jid, { text, footer, buttons }, quoted) =>
    conn.sendMessage(jid, {
        text, footer, headerType: 1,
        buttons: buttons.map(([displayText, id]) => ({ buttonId: id, buttonText: { displayText }, type: 1 })),
    }, { quoted })

export const sendLegacyList = (conn, jid, { text, footer, title, buttonText, sections }, quoted) =>
    conn.sendMessage(jid, { text, footer, title, buttonText, sections }, { quoted })

export const sendTemplate = (conn, jid, { text, footer, templateButtons }, quoted) =>
    conn.sendMessage(jid, { text, footer, templateButtons }, { quoted })

export const sendProduct = async (conn, jid, p, quoted) => {
    const media = await prepareWAMessageMedia({ image: p.image }, { upload: conn.waUploadToServer })
    return relay(conn, jid, {
        productMessage: {
            product: {
                productImage: media.imageMessage,
                productId: p.productId,
                title: p.title,
                description: p.description,
                currencyCode: p.currency || 'USD',
                priceAmount1000: Math.round((p.price || 0) * 1000),
                retailerId: p.retailerId,
                url: p.url,
                productImageCount: 1,
            },
            businessOwnerJid: p.businessOwnerJid || conn.user.id.split(':')[0] + '@s.whatsapp.net',
            body: p.body,
            footer: p.footer,
        },
    }, quoted)
}

export const sendShop = (conn, jid, { body, footer, shopId, surface = 1 }, quoted) =>
    relay(conn, jid, {
        viewOnceMessage: {
            message: {
                messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                interactiveMessage: {
                    body: { text: body || ' ' },
                    footer: footer ? { text: footer } : undefined,
                    shopStorefrontMessage: { surface, id: shopId },
                },
            },
        },
    }, quoted)

export const sendOrder = (conn, jid, o, quoted) =>
    relay(conn, jid, {
        orderMessage: {
            orderId: o.orderId,
            itemCount: o.itemCount || 1,
            status: 1,
            surface: 1,
            message: o.message,
            orderTitle: o.title,
            sellerJid: o.sellerJid || conn.user.id.split(':')[0] + '@s.whatsapp.net',
            token: o.token || '',
            totalAmount1000: Math.round((o.total || 0) * 1000),
            totalCurrencyCode: o.currency || 'USD',
        },
    }, quoted)

export async function sendRich(sock, jid, content) {
    const id = '3EB0' + randomBytes(9).toString('hex').toUpperCase()

    const message = {
        messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2
        },
        ...content
    }

    await sock.relayMessage(jid, message, { messageId: id })
    await new MB.AIRich(sock).sendEdit(jid, id, { msg: message })

    return id
}

export const sendPollImage = async (conn, jid, { name, options, selectableCount = 1, messageSecret }, quoted) => {
    if (!proto?.Message?.PollContentType?.IMAGE || !proto?.MessageAssociation?.AssociationType?.MEDIA_POLL) {
        throw new Error('sendPollImage: your proto version is outdated and lacks Media Poll support')
    }
    if (jid.endsWith('@newsletter') || jid === 'status@broadcast') throw new Error('sendPollImage: chats and groups only')
    if (!name) throw new Error('sendPollImage: name is required')
    if (!Array.isArray(options) || options.length < 2) throw new Error('sendPollImage: at least 2 options are required')
    if (!Number.isInteger(selectableCount) || selectableCount < 0 || selectableCount > options.length) {
        throw new Error('sendPollImage: invalid selectableCount')
    }
    for (const o of options) {
        if (typeof o?.name !== 'string' || !o.name || !o.image) throw new Error('sendPollImage: each option needs name and image')
    }

    const userJid = conn.user.id
    const parentId = newMsgId(conn)
    const parentKey = { remoteJid: jid, fromMe: true, id: parentId }

    const prepared = await Promise.all(options.map(async (o) => {
        const media = await prepareWAMessageMedia(
            { image: o.image, caption: o.name, ...(o.mimetype ? { mimetype: o.mimetype } : {}) },
            { upload: conn.waUploadToServer, jid }
        )
        return { name: o.name, imageMessage: media.imageMessage }
    }))

    const pollOptions = []
    const optionMessages = []
    for (const o of prepared) {
        const imageMessage = proto.Message.ImageMessage.fromObject({ ...o.imageMessage, caption: o.name })
        pollOptions.push({ optionName: o.name, optionHash: mediaPollOptionHash(o.name, imageMessage.fileSha256) })
        optionMessages.push(proto.Message.create({
            pollCreationOptionImageMessage: { message: { imageMessage } },
            messageContextInfo: {
                messageAssociation: {
                    associationType: proto.MessageAssociation.AssociationType.MEDIA_POLL,
                    parentMessageKey: parentKey,
                },
            },
        }))
    }

    const pollContent = proto.Message.create({
        pollCreationMessageV3: {
            name,
            options: pollOptions,
            selectableOptionsCount: selectableCount,
            pollContentType: proto.Message.PollContentType.IMAGE,
        },
        messageContextInfo: { messageSecret: messageSecret || randomBytes(32) },
    })

    const pollMsg = generateWAMessageFromContent(jid, pollContent, { messageId: parentId, userJid, quoted })
    await conn.relayMessage(jid, pollMsg.message, {
        messageId: parentId,
        additionalNodes: [{ tag: 'meta', attrs: { polltype: 'creation' } }],
    })

    const optionMsgs = []
    for (const content of optionMessages) {
        const id = newMsgId(conn)
        optionMsgs.push(generateWAMessageFromContent(jid, content, { messageId: id, userJid }))
        await conn.relayMessage(jid, { ...content, imageMessage: { __hint: true } }, { messageId: id })
    }

    const refreshId = newMsgId(conn)
    const refreshContent = proto.Message.create({
        protocolMessage: {
            key: parentKey,
            type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
            timestampMs: Date.now(),
            editedMessage: pollContent,
        },
    })
    await conn.relayMessage(jid, refreshContent, {
        messageId: refreshId,
        additionalAttributes: { edit: '1' },
        additionalNodes: [{ tag: 'meta', attrs: { polltype: 'edit' } }],
    })

    return { pollMessage: pollMsg, optionImageMessages: optionMsgs }
}

export default {
    btn, sendButtons, sendList, sendQuickReplies, sendUrlButtons,
    sendCards, sendPoll, sendViewOnce,
    sendAlbum, sendEvent, sendContact, sendLocation, sendLiveLocation,
    sendSticker, sendReaction, sendMention, forwardMessage,
    editMessage, deleteMessage, pinMessage, sendGroupInvite,
    sendAI, sendToChannel,
    sendLegacyButtons, sendLegacyList, sendTemplate,
    sendProduct, sendShop, sendOrder, sendRich, sendPollImage,
}
