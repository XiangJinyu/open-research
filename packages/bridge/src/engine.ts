import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { homedir } from "os"
import { join } from "path"
import type { ChannelAdapter, InboundMessage } from "./adapter.js"
import { SessionStore } from "./store.js"

export interface BridgeOptions {
  serverUrl: string
  adapters: ChannelAdapter[]
  agent?: string
  model?: string
  sessionDir?: string
}

interface ActiveSession {
  sessionId: string
  platform: string
  chatId: string
  buffer: string
  lastFlushAt: number
  messageId: string | null
  adapter: ChannelAdapter
  activeTools: Map<string, string>  // callID → display label
  completedTools: string[]          // labels of finished tools
}

const THROTTLE_MS = 500

export class BridgeEngine {
  private readonly sdk
  private readonly store: SessionStore
  private readonly activeSessions = new Map<string, ActiveSession>()
  private eventLoopRunning = false

  constructor(private readonly options: BridgeOptions) {
    this.sdk = createOpencodeClient({ baseUrl: options.serverUrl })
    const sessionDir = options.sessionDir ?? join(homedir(), ".openresearch", "bridge")
    this.store = new SessionStore(sessionDir)
  }

  async start(): Promise<void> {
    for (const adapter of this.options.adapters) {
      adapter.onMessage((msg) => void this.handleInbound(msg))
      await adapter.start()
      console.log(`[bridge] adapter "${adapter.id}" started`)
    }
    void this.runEventLoop()
  }

  async stop(): Promise<void> {
    this.eventLoopRunning = false
    for (const adapter of this.options.adapters) {
      await adapter.stop()
    }
  }

  private sessionKey(platform: string, chatId: string): string {
    return `${platform}:${chatId}`
  }

  private async handleInbound(msg: InboundMessage): Promise<void> {
    console.log(`[bridge] inbound from ${msg.platform} chat=${msg.chatId} text="${msg.text}"`)
    const adapter = this.options.adapters.find((a) => a.id === msg.platform)
    if (!adapter) return

    // Resolve or create a session
    let sessionId = this.store.get(msg.platform, msg.chatId)
    if (!sessionId) {
      console.log("[bridge] creating session...")
      const res = await this.sdk.session.create({ title: `Bridge ${msg.platform}:${msg.chatId}` })
      console.log("[bridge] session.create response:", JSON.stringify(res))
      if (res.error) {
        console.error("[bridge] failed to create session:", res.error)
        await adapter.sendText(msg.chatId, "抱歉，创建会话失败，请稍后再试。").catch(() => {})
        return
      }
      sessionId = res.data.id
      this.store.set(msg.platform, msg.chatId, sessionId)
    } else {
      this.store.touch(msg.platform, msg.chatId)
    }

    console.log(`[bridge] using session ${sessionId}`)
    // Send placeholder message
    const { messageId } = await adapter.sendText(msg.chatId, "思考中...").catch(() => ({ messageId: "" }))
    console.log(`[bridge] placeholder sent, messageId=${messageId}`)

    // Register active session for event tracking
    const key = this.sessionKey(msg.platform, msg.chatId)
    this.activeSessions.set(sessionId, {
      sessionId,
      platform: msg.platform,
      chatId: msg.chatId,
      buffer: "",
      lastFlushAt: 0,
      messageId: messageId || null,
      adapter,
      activeTools: new Map(),
      completedTools: [],
    })

    // Send prompt
    const promptParams: Parameters<typeof this.sdk.session.prompt>[0] = {
      sessionID: sessionId,
      parts: [{ type: "text", text: msg.text }],
    }
    if (this.options.agent) promptParams.agent = this.options.agent
    if (this.options.model) {
      // model string format: "providerID/modelID"
      const [providerID, ...rest] = this.options.model.split("/")
      if (providerID && rest.length > 0) {
        promptParams.model = { providerID, modelID: rest.join("/") }
      }
    }

    const promptRes = await this.sdk.session.prompt(promptParams)
    if (promptRes.error) {
      console.error("[bridge] failed to send prompt:", promptRes.error)
      if (messageId) {
        await adapter.updateText(msg.chatId, messageId, "抱歉，发送消息失败，请稍后再试。").catch(() => {})
      }
      this.activeSessions.delete(sessionId)
    }
  }

  private async runEventLoop(): Promise<void> {
    this.eventLoopRunning = true
    while (this.eventLoopRunning) {
      try {
        const events = await this.sdk.event.subscribe()
        for await (const event of (events as any).stream) {
          if (!this.eventLoopRunning) break

          if (event.type === "message.part.updated") {
            const part = event.properties.part
            await this.handlePartUpdated(part)
          } else if (event.type === "session.status") {
            const { sessionID, status } = event.properties
            if (status.type === "idle") {
              await this.handleSessionIdle(sessionID)
            }
          } else if (event.type === "permission.asked") {
            const { id: requestID, sessionID } = event.properties
            // Auto-reject permissions (consistent with `research run`)
            await this.sdk.permission.reply({ requestID, reply: "reject" }).catch(() => {})
            console.log(`[bridge] auto-rejected permission request ${requestID} for session ${sessionID}`)
          } else if (event.type === "session.error") {
            const { sessionID, error } = event.properties as { sessionID: string; error: string }
            const session = this.activeSessions.get(sessionID)
            if (session?.messageId) {
              await session.adapter
                .updateText(session.chatId, session.messageId, `错误：${error ?? "未知错误"}`)
                .catch(() => {})
            }
            this.activeSessions.delete(sessionID)
          }
        }
      } catch (err) {
        if (!this.eventLoopRunning) break
        console.error("[bridge] event loop error, reconnecting in 3s:", err)
        await new Promise((r) => setTimeout(r, 3000))
      }
    }
  }

  private renderStatus(session: ActiveSession): string {
    const lines: string[] = []
    for (const label of session.activeTools.values()) {
      lines.push(`⏳ ${label}`)
    }
    if (session.completedTools.length > 0) {
      lines.push(session.completedTools.map((t) => `✅ ${t}`).join("\n"))
    }
    return lines.join("\n")
  }

  private async flushCard(session: ActiveSession): Promise<void> {
    if (!session.messageId) return
    const status = this.renderStatus(session)
    session.lastFlushAt = Date.now()
    await session.adapter.updateCard(session.chatId, session.messageId, status, session.buffer).catch(() => {})
  }

  private async handlePartUpdated(part: any): Promise<void> {
    const session = this.activeSessions.get(part.sessionID)
    if (!session) return

    if (part.type === "text") {
      if (part.text) session.buffer = part.text

      const now = Date.now()
      const isFinalized = !!part.time?.end
      const throttleElapsed = now - session.lastFlushAt >= THROTTLE_MS

      if (isFinalized || throttleElapsed) {
        await this.flushCard(session)
      }
    } else if (part.type === "tool") {
      const status = part.state?.status
      const label = part.state?.title || part.tool

      if (status === "running") {
        session.activeTools.set(part.callID, label)
        await this.flushCard(session)
      } else if (status === "completed" || status === "error") {
        session.activeTools.delete(part.callID)
        if (status === "completed") {
          session.completedTools.push(label)
        }
        await this.flushCard(session)
      }
    }
  }

  private async handleSessionIdle(sessionID: string): Promise<void> {
    const session = this.activeSessions.get(sessionID)
    if (!session) return

    // Final flush — keep completed tool history, clear any still-running ones
    if (session.messageId) {
      session.activeTools.clear()
      const finalStatus = this.renderStatus(session)
      await session.adapter.updateCard(session.chatId, session.messageId, finalStatus, session.buffer || "（无回复）").catch(() => {})
    }

    this.activeSessions.delete(sessionID)
  }
}
