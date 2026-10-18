import type { PiLimits, PiSession } from './session'
import type { PiError } from './controller'

export interface PiBinding {
  connectionId: string
  documentId: string
  sessionKey: string
}

export interface PiConnect {
  version: 1
  op: 'connect'
  requestId: string
  binding: PiBinding
  session: PiSession
  limits?: PiLimits
}

export interface PiEnvelope {
  version: 1
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
