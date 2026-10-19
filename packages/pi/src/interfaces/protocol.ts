import type { PiLimits, PiSession } from './session'
import type { PiError } from './controller'

/**
 * Wire protocol version between the page and the Pi service worker. Bump it
 * whenever the message contract changes. The page registers the worker script
 * under a versioned URL, so a browser that still holds an older worker script
 * never pairs it with a newer page.
 */
export const piProtocolVersion = 2

export interface PiBinding {
  connectionId: string
  documentId: string
  sessionKey: string
}

export interface PiConnect {
  version: typeof piProtocolVersion
  op: 'connect'
  requestId: string
  binding: PiBinding
  session: PiSession
  limits?: PiLimits
}

export interface PiEnvelope {
  version: typeof piProtocolVersion
  binding: PiBinding
  requestId: string
  op: 'request' | 'reply' | 'event' | 'cancel' | 'cancelled'
  method?: string
  payload?: unknown
  error?: PiError
}

export interface PiPeer {
  call(
    method: string,
    payload?: unknown,
    signal?: AbortSignal,
    timeoutMs?: number | null
  ): Promise<unknown>
  event(method: string, payload: unknown): void
  cancelIncoming(): void
  close(): void
  receive(data: unknown): Promise<void>
}
