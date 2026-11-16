let handler = async (m, { conn, text, usedPrefix, command, args, isOwner }) => {

  const sender = m.sender
  const number = sender.split('@')[0]

  const vCard = `BEGIN:VCARD
VERSION:3.0
N:Sy;Bot;;;
FN:y
item1.TEL;waid=${number}:${number}
item1.X-ABLabel:Ponsel
END:VCARD`

  const fkontak2 = {
    key: {
      participants: '0@s.whatsapp.net',
      remoteJid: 'status@broadcast',
      fromMe: false,
      id: 'hey'
    },
    message: {
      contactMessage: { vcard: vCard }
    },
    participant: '0@s.whatsapp.net'
  }

  if (!isOwner) {
    return
  }

  const linkRegex = /chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/i

  const input = args.join(" ") || m.quoted?.text || ""

  if (!input)
    throw `✠ Send a group link, boss\n\n📌 Example:\n*${usedPrefix + command}* https://chat.whatsapp.com/...`

  const match = input.match(linkRegex)

  if (!match) throw `✠ This link is invalid!`

  const code = match[1]

  const delay = ms => new Promise(r => setTimeout(r, ms))

  await conn.sendMessage(
    m.chat,
    {
      text:
`*┏┅┅━━━━━━━━━━━━━━━━━━━┓*
*┃╻⏳╹↵ Joining...*
*┗┅┅━━━━━━━━━━━━━━━━━━━┛*`
    },
    { quoted: fkontak2 }
  )

  await delay(3000)

  try {
    const res = await conn.groupAcceptInvite(code)

    await conn.sendMessage(
      m.chat,
      {
        text:
`*┏┅┅━━━━━━━━━━━━━━━━━━━┓*
*┃╻✅╹↵ Joined successfully*
*┗┅┅━━━━━━━━━━━━━━━━━━━┛*`
      },
      { quoted: fkontak2 }
    )

  } catch (e) {
    console.log(e)
    throw 'There is a problem inviting the bot to the group or the link has expired.'
  }
}

handler.help = ['join']
handler.tags = ['owner']
handler.command = ['خش', 'انضم', "join"]
handler.owner = true

export default handler