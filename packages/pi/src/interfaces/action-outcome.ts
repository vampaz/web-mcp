import type { ToolInvocationResult } from '@vampaz/webmcp-kit'

export interface PiActionOutcome {
  toolName: string
  input: Record<string, unknown>
  status: ToolInvocationResult['status']
}

export type PiActionState =
  | { kind: 'not-started' }
  | { kind: 'invoking' | 'received' | 'persisted'; callId: string }

export type PiActionEvent =
  | { type: 'invoke'; callId: string }
  | { type: 'receive'; callId: string }
  | { type: 'persist'; callId: string }
