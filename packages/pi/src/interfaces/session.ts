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
  /** UTF-8 bytes per resolver request; default four bytes per model context token, or 128 KiB if unknown. */
  maxRequestBytes?: number
  /** Milliseconds per resolver request; 1,000–600,000, default 120,000. */
  requestTimeoutMs?: number
  /** Override the resolver's actual context window; unknown capacity does not trigger proactive summaries. */
  contextTokens?: number
  /** Characters per user message; 1–100,000, default 16,000. */
  maxMessageChars?: number
}
