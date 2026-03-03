import * as lark from "@larksuiteoapi/node-sdk"
import type { ChannelAdapter, InboundMessage } from "@opencode-ai/bridge"
import { BridgeEngine } from "@opencode-ai/bridge"
import { homedir } from "os"
import { join } from "path"
import { mkdirSync, writeFileSync } from "fs"

// Feishu interactive card text limit is ~30KB; we leave some headroom
const CARD_TEXT_LIMIT = 28 * 1024
const DOWNLOAD_DIR = join(homedir(), ".openresearch", "bridge", "feishu-files")

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

    const senderType: string = data?.sender?.sender_type ?? ""
    if (senderType === "bot") return

    const senderId: string = data?.sender?.sender_id?.open_id ?? ""
    const chatId: string = message.chat_id ?? ""
    const chatType: string = message.chat_type ?? "p2p"

    let parsed: Record<string, unknown> = {}
    try {
      parsed = JSON.parse(message.content ?? "{}") as Record<string, unknown>
    } catch {
      return
    }

    const msgType = message.message_type as string
    let text = ""

    if (msgType === "text") {
      text = (parsed.text as string) ?? ""
    } else if (msgType === "post" || msgType === "interactive") {
      text = await this.extractContent(parsed, message.message_id)
    } else if (msgType === "image") {
      const imageKey = parsed.image_key as string
      const ext = "png"
      const localPath = imageKey
        ? await this.downloadResource(message.message_id, imageKey, "image", `${imageKey}.${ext}`)
        : null
      text = localPath
        ? `用户发送了一张图片，已保存到: ${localPath}`
        : "用户发送了一张图片（下载失败）"
    } else if (msgType === "file") {
      const fileKey = (parsed.file_key ?? parsed.image_key) as string
      const name = (parsed.file_name as string) ?? "file"
      const localPath = fileKey
        ? await this.downloadResource(message.message_id, fileKey, "file", name)
        : null
      text = localPath
        ? `用户发送了文件「${name}」，已保存到: ${localPath}`
        : `用户发送了文件「${name}」（下载失败）`
    } else {
      return
    }

    if (!text.trim()) return

    if (this.options.requireMention && chatType !== "p2p") {
      const mentions: any[] = message.mentions ?? []
      if (!mentions.length) return
      text = text.replace(/@\S+/g, "").trim()
      if (!text.trim()) return
    }

    console.log(`[feishu] dispatching: chatId=${chatId} msgType=${msgType} text="${text}"`)
    this.messageHandler?.({
      platform: "feishu",
      chatId,
      userId: senderId,
      text,
    })
  }

  private async extractContent(body: Record<string, unknown>, messageId: string): Promise<string> {
    if (typeof body.text === "string") return body.text
    // Post: blocks under a language key or directly under "content"
    const candidates: unknown[][] = []
    for (const lang of ["zh_cn", "en_us", "ja_jp"]) {
      const blocks = (body[lang] as Record<string, unknown>)?.content
      if (Array.isArray(blocks)) candidates.push(blocks as unknown[][])
    }
    if (Array.isArray(body.content)) candidates.push(body.content as unknown[][])
    for (const blocks of candidates) {
      const parts: string[] = []
      for (const block of blocks) {
        for (const node of Array.isArray(block) ? block : [block]) {
          if (!node || typeof node !== "object") continue
          const n = node as Record<string, unknown>
          if (n.tag === "text" && typeof n.text === "string" && n.text) {
            parts.push(n.text)
          } else if (n.tag === "img" && typeof n.image_key === "string") {
            const p = await this.downloadResource(messageId, n.image_key as string, "image", `${n.image_key}.png`)
            parts.push(p ? `[图片: ${p}]` : "[图片: 下载失败]")
          }
        }
      }
      if (parts.length) return parts.join("\n")
    }
    // Interactive card elements
    const elements = (body.body as Record<string, unknown>)?.elements as unknown[]
    if (Array.isArray(elements)) {
      const parts: string[] = []
      for (const el of elements) {
        const e = el as Record<string, unknown>
        if (e.tag === "markdown" && typeof e.content === "string") parts.push(e.content)
        else if (e.tag === "div" && e.text && typeof (e.text as Record<string, unknown>).content === "string") {
          parts.push((e.text as Record<string, unknown>).content as string)
        }
      }
      if (parts.length) return parts.join("\n\n")
    }
    return ""
  }

  private async downloadResource(
    messageId: string,
    fileKey: string,
    type: "image" | "file",
    filename: string,
  ): Promise<string | null> {
    try {
      const res = await this.client.im.messageResource.get({
        path: { message_id: messageId, file_key: fileKey },
        params: { type },
      })
      const stream = (res as any)?.getReadableStream?.()
      if (!stream) return null
      const chunks: Buffer[] = []
      for await (const chunk of stream) chunks.push(Buffer.from(chunk))
      if (!chunks.length) return null
      mkdirSync(DOWNLOAD_DIR, { recursive: true })
      const dest = join(DOWNLOAD_DIR, `${Date.now()}-${filename}`)
      writeFileSync(dest, Buffer.concat(chunks))
      console.log(`[feishu] saved resource: ${dest} (${chunks.reduce((s, c) => s + c.length, 0)} bytes)`)
      return dest
    } catch (err) {
      console.error("[feishu] failed to download resource:", err)
      return null
    }
  }
}

function buildCard(text: string): object {
  return {
    config: { wide_screen_mode: true },
    elements: [{ tag: "div", text: { tag: "lark_md", content: text } }],
  }
}

function buildSplitCard(status: string, text: string): object {
  const elements: object[] = []

  if (status) {
    elements.push({ tag: "div", text: { tag: "lark_md", content: status } })
  }

  if (text) {
    elements.push({ tag: "div", text: { tag: "lark_md", content: text } })
  }

  if (elements.length === 0) {
    elements.push({ tag: "div", text: { tag: "lark_md", content: "思考中..." } })
  }

  return { config: { wide_screen_mode: true }, elements }
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
    allowAllPermissions: process.env.RESEARCH_ALLOW_ALL_PERMISSIONS === "true",
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
