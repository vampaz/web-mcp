import type { ToolResolver } from './tool'

export type CommandState =
  | { kind: 'idle' | 'completed' | 'failed' }
  | { kind: 'preparing' | 'resolving' | 'executing'; controller: AbortController }
  | { kind: 'settling'; controller: AbortController; phase: 'completed' | 'failed' }
  | {
      kind: 'stopping'
      controller: AbortController
      phase: 'preparing' | 'resolving' | 'executing'
    }

export type CommandEvent =
  | { type: 'start'; controller: AbortController }
  | { type: 'progress'; phase: 'resolving' | 'executing' }
  | { type: 'cancel' }
  | { type: 'release' }
  | { type: 'settle'; phase: 'completed' | 'failed' }

export type CommandResolverState =
  | { kind: 'empty'; revision: number }
  | { kind: 'creating'; revision: number; promise: Promise<ToolResolver> }
  | { kind: 'ready'; revision: number; resolver: ToolResolver }

export type CommandResolverEvent =
  | { type: 'create'; promise: Promise<ToolResolver> }
  | { type: 'resolve'; revision: number; resolver: ToolResolver }
  | { type: 'reject'; promise: Promise<ToolResolver> }
  | { type: 'invalidate' }
