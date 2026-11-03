import type { ChatOperationEvent, ChatOperationState } from './interfaces/chat-state'

export function transitionChatOperation(
  state: ChatOperationState,
  event: ChatOperationEvent
): ChatOperationState {
  switch (event.type) {
    case 'reset':
      return { kind: 'idle', revision: state.revision + 1 }
    case 'send':
    case 'clear':
      return state.kind === 'idle'
        ? { kind: event.type === 'send' ? 'sending' : 'clearing', revision: state.revision }
        : state
    case 'settle':
      return state.kind === event.operation && state.revision === event.revision
        ? { kind: 'idle', revision: state.revision }
        : state
  }
}
