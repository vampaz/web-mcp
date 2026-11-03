import type { PiController } from './controller'

export type ConnectionState =
  | { kind: 'opening'; opening: Promise<PiController> }
  | { kind: 'suspending-opening'; opening: Promise<PiController>; promise: Promise<void> }
  | { kind: 'active'; runtime: PiController }
  | { kind: 'suspending'; runtime: PiController; promise: Promise<void> }
  | { kind: 'closing' | 'closed'; promise: Promise<void> }

export type ConnectionEvent =
  | { type: 'opened'; runtime: PiController }
  | { type: 'suspend'; promise: Promise<void> }
  | { type: 'resume'; promise: Promise<void> }
  | { type: 'close'; promise: Promise<void> }
  | { type: 'closed' }
