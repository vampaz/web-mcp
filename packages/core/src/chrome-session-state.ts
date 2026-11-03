import type { ChromeSessionEvent, ChromeSessionState } from './interfaces/chrome-session-state'

export function transitionChromeSession(
  state: ChromeSessionState,
  event: ChromeSessionEvent
): ChromeSessionState {
  switch (event.type) {
    case 'create':
      return state.kind === 'empty'
        ? { kind: 'creating', promise: event.promise, progress: 0, sessions: state.sessions }
        : state
    case 'resolve':
      return state.kind === 'creating' && state.promise === event.promise
        ? { kind: 'ready', session: event.session, sessions: state.sessions }
        : state
    case 'reject':
      return state.kind === 'creating' && state.promise === event.promise
        ? { kind: 'empty', sessions: state.sessions }
        : state
    case 'progress':
      return state.kind === 'creating' ? { ...state, progress: event.loaded } : state
    case 'cloned':
      if (state.kind === 'disposed') return { ...state }
      return state.kind === 'ready'
        ? { ...state, sessions: [...state.sessions, event.session] }
        : state
    case 'release':
      return state.sessions.includes(event.session)
        ? {
            ...state,
            sessions: state.sessions.filter(function other(session) {
              return session !== event.session
            })
          }
        : state
    case 'dispose':
      return state.kind === 'disposed' ? state : { kind: 'disposed', sessions: [] }
  }
}
