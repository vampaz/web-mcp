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

export type PiErrorReason =
  | 'tool_calls'
  | 'no_progress'
  | 'request_bytes'
  | 'history_bytes'
  | 'tool_result_bytes'
  | 'storage_quota'
  | 'context_overflow'
  | 'timeout'

export interface PiError {
  code: PiErrorCode
  message: string
  /** Narrows codes such as `limit_reached` and `storage_failed` to a specific remedy. */
  reason?: PiErrorReason
  /** True when an application action was invoked during the failed turn and may have run. */
  actionMayHaveRun?: boolean
}

export type PiToolStatus = 'success' | 'error' | 'blocked' | 'unavailable' | 'unknown'

export interface PiMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  text: string
  toolName?: string
  failed?: boolean
  /** Tool messages: the validated input the model chose. */
  input?: Record<string, unknown>
  /** Tool messages: `unknown` when an interruption hid whether the action ran. */
  status?: PiToolStatus
  /** Tool messages: application output, or a structured failure when partial-result details exist. */
  output?: unknown
}

export type PiActivity =
  | { kind: 'resolving' }
  | { kind: 'compacting' }
  | { kind: 'tool'; toolName: string; phase: 'approval' | 'running' }

export interface PiHistoryUsage {
  historyBytes: number
  maxHistoryBytes: number
}

export interface PiSnapshot {
  state: PiState
  messages: readonly PiMessage[]
  error?: PiError
  /** What a running turn is doing now; absent outside `running` and `stopping`. */
  activity?: PiActivity
  /** Durable log size, so a UI can warn before the history limit. */
  usage?: PiHistoryUsage
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
  /** Reloads saved history, for example after another tab finished a turn. */
  refresh(): Promise<void>
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
