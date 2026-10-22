export interface PiSession {
  namespace: string
  ownerId: string
  conversationId: string
}

export interface PiLimits {
  /** 1–50; default 12. */
  maxToolCalls?: number
  /** UTF-8 bytes in the durable commit log; default 8 MiB. */
  maxHistoryBytes?: number
  /** UTF-8 bytes per resolver request; default 128 KiB. */
  maxRequestBytes?: number
  /** Milliseconds per resolver request; 1,000–600,000, default 120,000. */
  requestTimeoutMs?: number
  /** Model context window in estimated tokens; 2,048–2,000,000, default 32,768. */
  contextTokens?: number
  /** Characters per user message; 1–100,000, default 16,000. */
  maxMessageChars?: number
}
