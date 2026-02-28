export interface InboundMessage {
  platform: string
  chatId: string
  userId: string
  text: string
  files?: { url: string; mime: string; name: string }[]
}

export interface ChannelAdapter {
  readonly id: string
  start(): Promise<void>
  stop(): Promise<void>
  onMessage(handler: (msg: InboundMessage) => void): void
  sendText(chatId: string, text: string): Promise<{ messageId: string }>
  updateText(chatId: string, messageId: string, text: string): Promise<void>
  /** 工具状态和正文分区渲染，status 为空时等同于 updateText */
  updateCard(chatId: string, messageId: string, status: string, text: string): Promise<void>
}
