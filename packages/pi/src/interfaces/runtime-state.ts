import type { PiTurnOutcome } from './controller'

export type RuntimeOperation =
  | {
      kind: 'running' | 'refreshing' | 'stopping' | 'refresh-stopping'
      controller: AbortController
      promise: Promise<PiTurnOutcome>
    }
  | { kind: 'clearing'; promise: Promise<void> }

export type RuntimeState =
  | { kind: 'opening'; pending: 'none' | 'changed' | 'cleared' }
  | { kind: 'ready' }
  | RuntimeOperation
  | { kind: 'closing'; promise: Promise<void> }
  | { kind: 'closed' }

export type RuntimeEvent =
  | { type: 'opened' | 'changed' | 'cleared' }
  | { type: 'start'; operation: RuntimeOperation & { kind: 'running' | 'refreshing' | 'clearing' } }
  | { type: 'stop' }
  | { type: 'settle'; promise: Promise<unknown> }
  | { type: 'close'; promise: Promise<void> }
  | { type: 'closed' }
