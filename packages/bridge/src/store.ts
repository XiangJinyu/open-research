import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs"
import { join } from "path"

interface SessionEntry {
  sessionId: string
  lastActivity: number
}

export class SessionStore {
  private readonly sessions = new Map<string, SessionEntry>()
  private readonly filePath: string

  constructor(private readonly sessionDir: string) {
    this.filePath = join(sessionDir, "sessions.json")
    this.load()
  }

  private load(): void {
    if (!existsSync(this.filePath)) return
    try {
      const raw = readFileSync(this.filePath, "utf-8")
      const data = JSON.parse(raw) as Record<string, SessionEntry>
      for (const [key, entry] of Object.entries(data)) {
        this.sessions.set(key, entry)
      }
    } catch {
      // ignore corrupt file
    }
  }

  private persist(): void {
    try {
      mkdirSync(this.sessionDir, { recursive: true })
      const data: Record<string, SessionEntry> = {}
      for (const [key, entry] of this.sessions.entries()) {
        data[key] = entry
      }
      writeFileSync(this.filePath, JSON.stringify(data, null, 2))
    } catch {
      // ignore write failures
    }
  }

  private key(platform: string, chatId: string): string {
    return `${platform}:${chatId}`
  }

  get(platform: string, chatId: string): string | undefined {
    return this.sessions.get(this.key(platform, chatId))?.sessionId
  }

  set(platform: string, chatId: string, sessionId: string): void {
    this.sessions.set(this.key(platform, chatId), {
      sessionId,
      lastActivity: Date.now(),
    })
    this.persist()
  }

  touch(platform: string, chatId: string): void {
    const entry = this.sessions.get(this.key(platform, chatId))
    if (entry) {
      entry.lastActivity = Date.now()
      this.persist()
    }
  }
}
