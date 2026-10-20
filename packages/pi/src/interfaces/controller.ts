import type { ResolverContext, ToolResolver } from '@vampaz/webmcp-kit'
import type { PiToolHost } from './host'
import type { PiLimits, PiSession } from './session'

export type PiState =
  | 'loading'
  | 'idle'
  | 'running'
  | 'stopping'
  | 'interrupted'
  | 'error'
  | 'closed'
export type PiErrorCode =
  | 'unsupported'
  | 'configuration'
  | 'storage_failed'
  | 'provider_failed'
  | 'stale_document'
  | 'action_denied'
  | 'tool_failed'
  | 'limit_reached'
  | 'conversation_busy'

export interface PiError {
  code: PiErrorCode
  message: string
}

export interface PiMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  text: string
  toolName?: string
  failed?: boolean
}

export interface PiSnapshot {
  state: PiState
  messages: readonly PiMessage[]
  error?: PiError
}

export interface PiTurnOutcome {
  status: 'completed' | 'interrupted' | 'error'
  error?: PiError
}

export interface PiController {
  getSnapshot(): PiSnapshot
  subscribe(listener: (snapshot: PiSnapshot) => void): () => void
  send(text: string): Promise<PiTurnOutcome>
  stop(): Promise<void>
  clear(): Promise<void>
  destroy(): Promise<void>
}

export interface PiRuntimeOptions {
  session: PiSession
  resolver: ToolResolver
  host: PiToolHost
  limits?: PiLimits
}

export interface PiHarnessOptions {
  session: PiSession
  resolver: ToolResolver
  context?: () => ResolverContext | Promise<ResolverContext>
  host?: PiToolHost
  limits?: PiLimits
  /** Called when pending application approval UI must close. */
  onCancel?: () => void
}
