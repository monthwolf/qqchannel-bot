import { AvailableIntentsEventsEnum, createOpenAPI, createWebsocket } from 'qq-guild-bot'
import wss from './wss'
import type { IBotInfoResp, ILoginReq } from '../interface/common'
import { EventEmitter } from 'events'

interface IConnection {
  appid: string | null
  token: string | null
  client: ReturnType<typeof createOpenAPI> | null
  ws: ReturnType<typeof createWebsocket> | null
  botInfo: IBotInfoResp | null
}

const connection: IConnection = { appid: null, token: null, client: null, ws: null, botInfo: null }
const qqBotEmitter = new EventEmitter()

// 监听登录事件，建立与 qq 机器人服务器的连接
wss.on('bot/login', (ws, data) => {
  const loginReq = data as ILoginReq
  connectQQChannel(loginReq)
  wss.send(ws, { cmd: 'bot/login', success: true, data: null })
  // 顺便获取机器人自己与频道的信息
  getBotInfo().then(botInfo => {
    console.log('[GetBotInfo]', botInfo)
    if (botInfo && loginReq.appid === connection.appid) {
      connection.botInfo = botInfo
      wss.send(ws, { cmd: 'bot/info', success: true, data: botInfo })
    }
  })
})

function connectQQChannel(params: ILoginReq) {
  // 是否已有连接
  if (connection.ws) {
    // 如果是相同的连接，就不用处理了
    if (connection.appid === params.appid && connection.token === params.token) {
      return
    }
    // 如果是不同的连接，就断掉原来的连接重连
    // 这样是否可以了
    connection.ws.disconnect()
    connection.appid = null
    connection.token = null
    connection.client = null
    connection.ws = null
    connection.botInfo = null
  }

  const botConfig = {
    appID: params.appid, // 申请机器人时获取到的机器人 BotAppID
    token: params.token, // 申请机器人时获取到的机器人 BotToken
    intents: [AvailableIntentsEventsEnum.GUILD_MESSAGES], // 事件订阅,用于开启可接收的消息类型
    sandbox: false, // 沙箱支持，可选，默认false. v2.7.0+
  }
  connection.client = createOpenAPI(botConfig)
  const ws = connection.ws = createWebsocket(botConfig)
  connection.appid = params.appid
  connection.token = params.token

  ws.on(AvailableIntentsEventsEnum.GUILD_MESSAGES, (data) => {
    qqBotEmitter.emit(AvailableIntentsEventsEnum.GUILD_MESSAGES, data)
  })

  console.log('successful connect to qq server')
}

// 获取机器人和频道信息，由于是私域机器人，只需考虑一个频道即可
async function getBotInfo(): Promise<IBotInfoResp | null> {
  try {
    const meApi = connection.client!.meApi
    const [infoResp, guildResp] = await Promise.all([meApi.me(), meApi.meGuilds({ limit: 1 })])
    return {
      id: infoResp.data.id,
      username: infoResp.data.username,
      avatar: infoResp.data.avatar,
      guildId: guildResp.data[0].id,
      guildName: guildResp.data[0].name
    }
  } catch (e) {
    console.log(e)
    return null
  }
}

const qqApi = {
  on(event: AvailableIntentsEventsEnum, listener: (data: unknown) => void) {
    qqBotEmitter.on(event, listener)
  },
  get client() {
    if (!connection.client) console.warn('connection to qq channel is null!')
    return connection.client!
  },
  get botInfo() {
    return connection.botInfo
  }
}

export default qqApi