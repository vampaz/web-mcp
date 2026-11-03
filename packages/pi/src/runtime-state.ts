import type { RuntimeEvent, RuntimeState } from './interfaces/runtime-state'

export function transitionRuntime(state: RuntimeState, event: RuntimeEvent): RuntimeState {
  switch (event.type) {
    case 'opened':
      return state.kind === 'opening' ? { kind: 'ready' } : state
    case 'changed':
    case 'cleared':
      if (state.kind === 'opening') return { kind: 'opening', pending: event.type }
      return state.kind === 'ready' ? { ...state } : state
    case 'start':
      return state.kind === 'ready' ? event.operation : state
    case 'stop':
      return state.kind === 'running' || state.kind === 'refreshing'
        ? { ...state, kind: state.kind === 'refreshing' ? 'refresh-stopping' : 'stopping' }
        : state
    case 'settle':
      return 'promise' in state && state.kind !== 'closing' && state.promise === event.promise
        ? { kind: 'ready' }
        : state
    case 'close':
      return state.kind === 'closing' || state.kind === 'closed'
        ? state
        : { kind: 'closing', promise: event.promise }
    case 'closed':
      return state.kind === 'closing' ? { kind: 'closed' } : state
  }
}
