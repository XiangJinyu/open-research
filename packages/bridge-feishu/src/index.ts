import * as lark from "@larksuiteoapi/node-sdk"
import type { ChannelAdapter, InboundMessage } from "@opencode-ai/bridge"
import { BridgeEngine } from "@opencode-ai/bridge"

// Feishu interactive card text limit is ~30KB; we leave some headroom
const CARD_TEXT_LIMIT = 28 * 1024

export interface FeishuAdapterOptions {
  appId: string
  appSecret: string
  /** If true, group messages only trigger when the bot is @-mentioned */
  requireMention?: boolean
}

export class FeishuAdapter implements ChannelAdapter {
  readonly id = "feishu"

  private client: lark.Client
  private wsClient: lark.WSClient
  private messageHandler: ((msg: InboundMessage) => void) | null = null

  constructor(private readonly options: FeishuAdapterOptions) {
    this.client = new lark.Client({
      appId: options.appId,
      appSecret: options.appSecret,
      disableTokenCache: false,
    })

    this.wsClient = new lark.WSClient({
      appId: options.appId,
      appSecret: options.appSecret,
    })
  }

  async start(): Promise<void> {
    const dispatcher = new lark.EventDispatcher({}).register({
      "im.message.receive_v1": async (data: any) => {
        console.log("[feishu] raw event:", JSON.stringify(data, null, 2))
        try {
          await this.handleMessageReceive(data)
        } catch (err) {
          console.error("[feishu] error handling message:", err)
        }
      },
    })

    this.wsClient.start({ eventDispatcher: dispatcher })
    console.log("[feishu] WebSocket client started")
  }

  async stop(): Promise<void> {
    // lark.WSClient has no explicit stop method in current SDK versions
  }

  onMessage(handler: (msg: InboundMessage) => void): void {
    this.messageHandler = handler
  }

  async sendText(chatId: string, text: string): Promise<{ messageId: string }> {
    const cardContent = buildCard(text)
    const res = await this.client.im.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: chatId,
        msg_type: "interactive",
        content: JSON.stringify(cardContent),
      },
    })
    const messageId: string = (res as any)?.data?.message_id ?? ""
    return { messageId }
  }

  async updateText(chatId: string, messageId: string, text: string): Promise<void> {
    if (!messageId) return
    const truncated = truncateText(text)
    const cardContent = buildCard(truncated)
    await this.client.im.message.patch({
      path: { message_id: messageId },
      data: {
        content: JSON.stringify(cardContent),
      },
    })
  }

  async updateCard(chatId: string, messageId: string, status: string, text: string): Promise<void> {
    if (!messageId) return
    const truncated = truncateText(text)
    const cardContent = buildSplitCard(status, truncated)
    await this.client.im.message.patch({
      path: { message_id: messageId },
      data: {
        content: JSON.stringify(cardContent),
      },
    })
  }

  private async handleMessageReceive(data: any): Promise<void> {
    const message = data?.message
    if (!message) return

    // Skip messages from bots (sender_type === "bot")
    const senderType: string = data?.sender?.sender_type ?? ""
    if (senderType === "bot") return

    const senderId: string = data?.sender?.sender_id?.open_id ?? ""

    // Only handle text messages
    if (message.message_type !== "text") return

    // Parse message content
    let text: string
    try {
      const parsed = JSON.parse(message.content ?? "{}")
      text = parsed.text ?? ""
    } catch {
      return
    }

    if (!text.trim()) return

    const chatId: string = message.chat_id ?? ""
    const chatType: string = message.chat_type ?? "p2p"

    // In group chats, require @mention if configured
    if (this.options.requireMention && chatType !== "p2p") {
      const mentions: any[] = message.mentions ?? []
      // @_user_1 is the conventional key for the first @-mentioned user (the bot)
      const isMentioned = mentions.length > 0
      if (!isMentioned) return
      // Strip @mention text from message
      text = text.replace(/@\S+/g, "").trim()
      if (!text) return
    }

    console.log(`[feishu] dispatching: chatId=${chatId} text="${text}" handlerSet=${!!this.messageHandler}`)
    this.messageHandler?.({
      platform: "feishu",
      chatId,
      userId: senderId,
      text,
    })
  }
}

function buildCard(text: string): object {
  return {
    schema: "2.0",
    body: {
      elements: [
        {
          tag: "markdown",
          content: text,
        },
      ],
    },
  }
}

// 工具状态和正文分成两个独立 element，互不影响各自的 markdown 渲染
function buildSplitCard(status: string, text: string): object {
  const elements: object[] = []

  if (status) {
    elements.push({
      tag: "markdown",
      content: status,
    })
  }

  if (text) {
    elements.push({
      tag: "markdown",
      content: text,
    })
  }

  if (elements.length === 0) {
    elements.push({ tag: "markdown", content: "思考中..." })
  }

  return {
    schema: "2.0",
    body: { elements },
  }
}

function truncateText(text: string): string {
  const bytes = Buffer.byteLength(text, "utf8")
  if (bytes <= CARD_TEXT_LIMIT) return text
  // Truncate by character count approximation
  const ratio = CARD_TEXT_LIMIT / bytes
  const cutoff = Math.floor(text.length * ratio) - 20
  return text.slice(0, cutoff) + "\n\n*(内容已截断，超出飞书卡片限制)*"
}

// Default entry point
export async function main(): Promise<void> {
  const appId = process.env.FEISHU_APP_ID
  const appSecret = process.env.FEISHU_APP_SECRET
  const serverUrl = process.env.RESEARCH_SERVER_URL ?? "http://127.0.0.1:4096"

  if (!appId || !appSecret) {
    console.error("Error: FEISHU_APP_ID and FEISHU_APP_SECRET environment variables are required")
    process.exit(1)
  }

  const adapter = new FeishuAdapter({
    appId,
    appSecret,
    requireMention: process.env.FEISHU_REQUIRE_MENTION === "true",
  })

  const engine = new BridgeEngine({
    serverUrl,
    adapters: [adapter],
    agent: process.env.RESEARCH_AGENT,
    model: process.env.RESEARCH_MODEL,
  })

  await engine.start()
  console.log(`[bridge-feishu] running — connected to ${serverUrl}`)

  // Keep process alive
  process.on("SIGINT", async () => {
    console.log("\n[bridge-feishu] shutting down...")
    await engine.stop()
    process.exit(0)
  })
}

// Run when executed directly
main().catch((err) => {
  console.error("[bridge-feishu] fatal error:", err)
  process.exit(1)
})
