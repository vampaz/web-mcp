import type { PopupDrag, PopupPosition, PopupResize } from './interfaces/popup'
import { icon } from './icon'

const margin = 8

export class ChatPopup {
  private enabled = false
  private opened = false
  private drag?: PopupDrag
  private resizing?: PopupResize
  private dragged = false
  private expanded = false
  private pinnedRight = true
  private pinnedBottom = true
  private position?: PopupPosition
  private panelPosition?: PopupPosition
  private readonly launcher = document.createElement('button')
  private readonly move = document.createElement('button')
  private readonly resize = document.createElement('button')
  private readonly close = document.createElement('button')
  private readonly grip = document.createElement('span')
  private readonly observer: ResizeObserver
  private readonly onViewportChanged: () => void

  constructor(
    private readonly host: HTMLElement,
    private readonly surface: HTMLElement,
    private readonly panel: HTMLElement,
    titleId: string
  ) {
    this.launcher.type = this.move.type = this.resize.type = this.close.type = 'button'
    this.launcher.className = 'launcher'
    this.launcher.innerHTML = icon('M5 5h14v11H10l-5 4V5M9 9h6M9 12h4')
    this.launcher.setAttribute('aria-controls', panel.id)
    this.launcher.setAttribute('aria-haspopup', 'dialog')
    this.move.className = 'move icon-button'
    this.move.innerHTML = icon('M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01')
    this.move.setAttribute('aria-label', 'Move chat')
    this.resize.className = this.close.className = 'icon-button'
    this.resize.innerHTML = icon('M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7')
    this.resize.setAttribute('aria-label', 'Resize chat')
    this.close.innerHTML = icon('M6 6l12 12M18 6 6 18')
    this.close.setAttribute('aria-label', 'Close chat')
    for (const control of [this.move, this.resize, this.close])
      control.title = control.getAttribute('aria-label')!
    const instructions = document.createElement('span')
    instructions.id = `${titleId}-position`
    instructions.className = 'visually-hidden popup-instructions'
    instructions.hidden = true
    instructions.textContent =
      'Drag to move, or use the arrow keys. Hold Shift for larger steps. Resize chat cycles sizes; its arrow keys adjust the size. You can also drag the lower-right corner.'
    for (const control of [this.launcher, this.move, this.resize])
      control.setAttribute('aria-describedby', instructions.id)
    panel.querySelector('header')!.prepend(this.move)
    panel.querySelector('.header-actions')!.append(this.resize, this.close)
    this.grip.className = 'resize-grip'
    this.grip.setAttribute('aria-hidden', 'true')
    this.grip.innerHTML = icon('M20 15l-5 5M20 9 9 20')
    panel.append(this.grip)
    surface.prepend(this.launcher, instructions)
    this.launcher.addEventListener('click', (event) => {
      if (this.dragged && event.detail) return
      this.setOpen(!this.opened)
    })
    this.close.addEventListener('click', () => {
      this.setOpen(false)
    })
    panel.addEventListener('keydown', (event) => {
      if (this.enabled && event.key === 'Escape' && !event.isComposing && !event.defaultPrevented) {
        event.preventDefault()
        event.stopPropagation()
        this.setOpen(false)
      }
    })
    this.resize.addEventListener('click', () => {
      this.expanded = !this.expanded
      panel.style.width = this.expanded ? '46rem' : '26rem'
      panel.style.height = this.expanded ? '44rem' : '36rem'
      this.placePanel()
    })
    this.resize.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 40 : 10
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      event.preventDefault()
      const rect = panel.getBoundingClientRect()
      const horizontal = ['ArrowLeft', 'ArrowRight'].includes(event.key)
      const delta = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -step : step
      panel.style[horizontal ? 'width' : 'height'] =
        `${((horizontal ? rect.width : rect.height) + delta) / this.scale(panel)}px`
      this.placePanel()
    })
    this.grip.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !event.isPrimary) return
      event.preventDefault()
      const rect = panel.getBoundingClientRect()
      this.resizing = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        width: rect.width,
        height: rect.height
      }
      this.grip.setPointerCapture(event.pointerId)
    })
    this.grip.addEventListener('pointermove', (event) => {
      const start = this.resizing
      if (!start || start.pointerId !== event.pointerId) return
      event.preventDefault()
      const scale = this.scale(panel)
      panel.style.width = `${Math.max(0, start.width + event.clientX - start.x) / scale}px`
      panel.style.height = `${Math.max(0, start.height + event.clientY - start.y) / scale}px`
      this.placePanel()
    })
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
      this.grip.addEventListener(name, (event) => {
        if ((event as PointerEvent).pointerId === this.resizing?.pointerId)
          this.resizing = undefined
      })
    for (const control of [this.launcher, this.move]) {
      control.addEventListener('keydown', (event) => {
        const step = event.shiftKey ? 40 : 10
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
        event.preventDefault()
        const rect =
          control === this.launcher
            ? control.getBoundingClientRect()
            : panel.getBoundingClientRect()
        this.moveTo(control, {
          x:
            rect.left + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
          y: rect.top + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0)
        })
      })
      control.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || !event.isPrimary) return
        const rect =
          control === this.launcher
            ? control.getBoundingClientRect()
            : panel.getBoundingClientRect()
        this.dragged = false
        this.drag = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          position: { x: rect.left, y: rect.top }
        }
        control.setPointerCapture(event.pointerId)
      })
      control.addEventListener('pointermove', (event) => {
        const start = this.drag
        if (!start || start.pointerId !== event.pointerId) return
        const x = event.clientX - start.x
        const y = event.clientY - start.y
        if (!this.dragged && Math.hypot(x, y) < 3) return
        this.dragged = true
        event.preventDefault()
        this.moveTo(control, { x: start.position.x + x, y: start.position.y + y })
      })
      for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
        control.addEventListener(name, (event) => {
          if ((event as PointerEvent).pointerId === this.drag?.pointerId) this.drag = undefined
        })
    }
    this.onViewportChanged = this.reposition.bind(this)
    this.observer = new ResizeObserver(this.onViewportChanged)
    this.launcher.hidden =
      this.move.hidden =
      this.resize.hidden =
      this.close.hidden =
      this.grip.hidden =
        true
  }

  configure(mode: 'inline' | 'popup', title: string) {
    const changed = this.enabled !== (mode === 'popup')
    if (changed) this.disconnect()
    this.enabled = mode === 'popup'
    this.host.dataset.mode = mode
    this.surface.querySelector<HTMLElement>('.popup-instructions')!.hidden = !this.enabled
    this.launcher.hidden =
      this.move.hidden =
      this.resize.hidden =
      this.close.hidden =
      this.grip.hidden =
        !this.enabled
    this.launcher.setAttribute('aria-label', `Open ${title}`)
    this.panel.hidden = this.enabled && !this.opened
    if (this.enabled) {
      this.panel.setAttribute('role', 'dialog')
      this.surface.setAttribute('popover', 'manual')
    } else {
      this.panel.removeAttribute('role')
      this.surface.removeAttribute('popover')
      this.panel.style.cssText = ''
      this.expanded = false
    }
    this.launcher.setAttribute('aria-expanded', String(this.opened))
    if (this.host.isConnected && changed) this.connect()
  }

  connect() {
    if (!this.enabled) return
    this.panel.hidden = true
    this.launcher.setAttribute('aria-expanded', 'false')
    this.surface.showPopover()
    window.addEventListener('resize', this.onViewportChanged)
    window.visualViewport?.addEventListener('resize', this.onViewportChanged)
    window.visualViewport?.addEventListener('scroll', this.onViewportChanged)
    this.observer.observe(this.surface)
    this.observer.observe(this.launcher)
    this.observer.observe(this.panel)
    this.reposition()
  }

  disconnect() {
    this.drag = undefined
    this.resizing = undefined
    this.observer.disconnect()
    window.removeEventListener('resize', this.onViewportChanged)
    window.visualViewport?.removeEventListener('resize', this.onViewportChanged)
    window.visualViewport?.removeEventListener('scroll', this.onViewportChanged)
    if (this.enabled) this.surface.hidePopover()
    this.opened = false
  }

  private setOpen(open: boolean) {
    this.opened = open
    this.panel.hidden = !open
    this.launcher.setAttribute('aria-expanded', String(open))
    if (open) {
      this.placePanel()
      this.panel.querySelector('textarea')!.focus({ preventScroll: true })
    } else this.launcher.focus({ preventScroll: true })
  }

  private moveTo(control: HTMLElement, position: PopupPosition) {
    if (control === this.launcher) {
      this.position = this.place(this.launcher, position)
      const rect = this.launcher.getBoundingClientRect()
      this.pinnedRight = Math.abs(rect.right - innerWidth + margin) < 2
      this.pinnedBottom = Math.abs(rect.bottom - innerHeight + margin) < 2
      this.panelPosition = undefined
      this.placePanel()
    } else this.panelPosition = this.place(this.panel, position)
  }

  private reposition() {
    if (!this.enabled || !this.host.isConnected) return
    this.position = this.place(this.launcher, {
      x: this.pinnedRight ? innerWidth : (this.position?.x ?? innerWidth),
      y: this.pinnedBottom ? innerHeight : (this.position?.y ?? innerHeight)
    })
    if (this.opened) this.placePanel()
  }

  private placePanel() {
    if (!this.opened) return
    const viewport = window.visualViewport
    const scale = this.scale(this.panel)
    this.panel.style.setProperty(
      '--webmcp-popup-available-width',
      `${((viewport?.width ?? innerWidth) - margin * 2) / scale}px`
    )
    this.panel.style.setProperty(
      '--webmcp-popup-available-height',
      `${((viewport?.height ?? innerHeight) - margin * 2) / scale}px`
    )
    const launcher = this.launcher.getBoundingClientRect()
    const panel = this.panel.getBoundingClientRect()
    this.place(
      this.panel,
      this.panelPosition ?? {
        x: launcher.right - panel.width,
        y:
          launcher.top > innerHeight - launcher.bottom
            ? launcher.top - panel.height - margin
            : launcher.bottom + margin
      }
    )
  }

  private scale(element: HTMLElement): number {
    return element.getBoundingClientRect().width / element.offsetWidth || 1
  }

  private place(element: HTMLElement, position: PopupPosition): PopupPosition {
    const viewport = window.visualViewport
    const left = (viewport?.offsetLeft ?? 0) + margin
    const top = (viewport?.offsetTop ?? 0) + margin
    const rect = element.getBoundingClientRect()
    const x = Math.max(
      left,
      Math.min(position.x, left + (viewport?.width ?? innerWidth) - rect.width - margin * 2)
    )
    const y = Math.max(
      top,
      Math.min(position.y, top + (viewport?.height ?? innerHeight) - rect.height - margin * 2)
    )
    const scale = this.scale(element)
    element.style.left = `${x / scale}px`
    element.style.top = `${y / scale}px`
    return { x, y }
  }
}
