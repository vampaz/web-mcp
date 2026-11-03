import type {
  PopupEvent,
  PopupGesture,
  PopupGestureEvent,
  PopupSize,
  PopupState
} from './interfaces/popup'

export function transitionPopup(state: PopupState, event: PopupEvent): PopupState {
  switch (event.type) {
    case 'configure':
      if (event.mode === 'inline') return { kind: 'inline' }
      return state.kind === 'inline' ? { kind: 'detached', visibility: 'closed' } : { ...state }
    case 'connect':
      return state.kind === 'detached'
        ? { kind: state.visibility }
        : state.kind === 'inline'
          ? state
          : { ...state }
    case 'disconnect':
      return state.kind === 'inline' ? state : { kind: 'detached', visibility: 'closed' }
    case 'open':
    case 'close': {
      if (state.kind === 'inline') return state
      const visibility = event.type === 'open' ? 'open' : 'closed'
      if (
        state.kind === visibility ||
        (state.kind === 'detached' && state.visibility === visibility)
      )
        return state
      return state.kind === 'detached' ? { kind: 'detached', visibility } : { kind: visibility }
    }
  }
}

export function transitionPopupGesture(
  state: PopupGesture,
  event: PopupGestureEvent
): PopupGesture {
  switch (event.type) {
    case 'press':
      return { kind: 'pressed', start: event.start, control: event.control }
    case 'resize':
      return { kind: 'resizing', start: event.start }
    case 'move':
      return (state.kind === 'pressed' || state.kind === 'dragging') &&
        state.start.pointerId === event.pointerId
        ? { ...state, kind: 'dragging' }
        : state
    case 'resize-move':
      return state.kind === 'resizing' && state.start.pointerId === event.pointerId
        ? { ...state }
        : state
    case 'end':
      return 'start' in state && state.start.pointerId === event.pointerId
        ? { kind: state.kind === 'dragging' ? 'dragged' : 'idle' }
        : state
    case 'reset':
      return { kind: 'idle' }
  }
}

export function transitionPopupSize(state: PopupSize, event: 'toggle' | 'reset'): PopupSize {
  return event === 'reset' || state === 'expanded' ? 'normal' : 'expanded'
}
