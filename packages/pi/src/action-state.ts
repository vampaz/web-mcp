import type { PiError } from './interfaces/controller'
import type { PiActionEvent, PiActionState } from './interfaces/action-outcome'

export function transitionAction(state: PiActionState, event: PiActionEvent): PiActionState {
  switch (event.type) {
    case 'invoke':
      return state.kind === 'invoking' ? state : { kind: 'invoking', callId: event.callId }
    case 'receive':
      return state.kind === 'invoking' && state.callId === event.callId
        ? { kind: 'received', callId: event.callId }
        : state
    case 'persist':
      return state.kind === 'received' && state.callId === event.callId
        ? { kind: 'persisted', callId: event.callId }
        : state
  }
}

export function withActionRisk(state: PiActionState, error: PiError): PiError {
  switch (state.kind) {
    case 'invoking':
      return { ...error, actionMayHaveRun: true }
    case 'received':
      return error.code === 'storage_failed' || error.reason === 'history_bytes'
        ? { ...error, actionMayHaveRun: true }
        : error
    case 'not-started':
    case 'persisted':
      return error
  }
}
