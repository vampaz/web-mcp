export interface PopupPosition {
  x: number
  y: number
}

export interface PopupDrag {
  pointerId: number
  x: number
  y: number
  position: PopupPosition
}

export interface PopupResize {
  pointerId: number
  x: number
  y: number
  width: number
  height: number
  right: number
}

export type PopupState =
  | { kind: 'inline' }
  | { kind: 'detached'; visibility: 'open' | 'closed' }
  | { kind: 'open' | 'closed' }

export type PopupEvent =
  | { type: 'configure'; mode: 'inline' | 'popup' }
  | { type: 'connect' | 'disconnect' | 'open' | 'close' }

export type PopupGesture =
  | { kind: 'idle' | 'dragged' }
  | { kind: 'pressed' | 'dragging'; start: PopupDrag; control: HTMLElement }
  | { kind: 'resizing'; start: PopupResize }

export type PopupGestureEvent =
  | { type: 'press'; start: PopupDrag; control: HTMLElement }
  | { type: 'resize'; start: PopupResize }
  | { type: 'move' | 'resize-move'; pointerId: number }
  | { type: 'end'; pointerId: number }
  | { type: 'reset' }

export type PopupSize = 'normal' | 'expanded'
