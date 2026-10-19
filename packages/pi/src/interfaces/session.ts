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
}
