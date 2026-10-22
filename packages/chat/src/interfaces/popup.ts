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
