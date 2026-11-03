export type ChatOperationState = { kind: 'idle' | 'sending' | 'clearing'; revision: number }

export type ChatOperationEvent =
  | { type: 'send' | 'clear' | 'reset' }
  | { type: 'settle'; operation: 'sending' | 'clearing'; revision: number }
