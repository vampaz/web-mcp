import type { ConnectionEvent, ConnectionState } from './interfaces/connection-state'

export function transitionConnection(
  state: ConnectionState,
  event: ConnectionEvent
): ConnectionState {
  switch (event.type) {
    case 'opened':
      if (state.kind === 'opening') return { kind: 'active', runtime: event.runtime }
      return state.kind === 'suspending-opening'
        ? { kind: 'suspending', runtime: event.runtime, promise: state.promise }
        : state
    case 'suspend':
      if (state.kind === 'opening' || state.kind === 'suspending-opening')
        return { kind: 'suspending-opening', opening: state.opening, promise: event.promise }
      return state.kind === 'active' || state.kind === 'suspending'
        ? { kind: 'suspending', runtime: state.runtime, promise: event.promise }
        : state
    case 'resume':
      if (state.kind === 'suspending-opening' && state.promise === event.promise)
        return { kind: 'opening', opening: state.opening }
      return state.kind === 'suspending' && state.promise === event.promise
        ? { kind: 'active', runtime: state.runtime }
        : state
    case 'close':
      return state.kind === 'closing' || state.kind === 'closed'
        ? state
        : { kind: 'closing', promise: event.promise }
    case 'closed':
      return state.kind === 'closing' ? { ...state, kind: 'closed' } : state
  }
}
