import type { HostedSessionEvent, HostedSessionState } from './interfaces/hosted-session-state'

export function transitionHostedSession(
  state: HostedSessionState,
  event: HostedSessionEvent
): HostedSessionState {
  switch (event.type) {
    case 'acquire':
      return state.kind !== 'acquiring'
        ? { kind: 'acquiring', request: event.request, waiters: 0 }
        : state
    case 'join':
      return state.kind === 'acquiring' && state.request === event.request
        ? { ...state, waiters: state.waiters + 1 }
        : state
    case 'leave':
      if (state.kind !== 'acquiring' || state.request !== event.request || state.waiters === 0)
        return state
      return state.waiters === 1 && event.cancelled
        ? { kind: 'empty' }
        : { ...state, waiters: state.waiters - 1 }
    case 'resolve':
      return state.kind === 'acquiring' && state.request === event.request
        ? { kind: 'ready', session: event.session }
        : state
    case 'reject':
      return state.kind === 'acquiring' && state.request === event.request
        ? { kind: 'empty' }
        : state
    case 'invalidate':
      return state.kind === 'ready' && state.session === event.session ? { kind: 'empty' } : state
  }
}
