import type { WebMCPChatLabels } from './interfaces/chat'
import type { PopupDrag, PopupPosition, PopupResize } from './interfaces/popup'
import { icon } from './icon'

export class ChatPopup {
  private enabled = false
  private active = false
  private opened = false
  private drag?: PopupDrag
  private resizing?: PopupResize
  private dragged = false
  private expanded = false
  private placement: 'end' | 'start' = 'end'
  private pinnedInline = true
  private pinnedBottom = true
  private position?: PopupPosition
  private panelPosition?: PopupPosition
  private readonly launcher = document.createElement('button')
  private readonly move = document.createElement('button')
  private readonly resize = document.createElement('button')
  private readonly close = document.createElement('button')
  private readonly grip = document.createElement('span')
  private readonly moveHelp = document.createElement('span')
  private readonly resizeHelp = document.createElement('span')
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
    this.launcher.setAttribute('part', 'launcher')
    this.launcher.innerHTML = icon('M5 5h14v11H10l-5 4V5M9 9h6M9 12h4')
    this.launcher.setAttribute('aria-controls', panel.id)
    this.launcher.setAttribute('aria-haspopup', 'dialog')
    this.move.className = 'move icon-button'
    this.move.innerHTML = icon('M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01')
    this.resize.className = this.close.className = 'icon-button'
    this.resize.dataset.resize = ''
    this.resize.innerHTML = icon('M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7')
    this.close.innerHTML = icon('M6 6l12 12M18 6 6 18')
    this.moveHelp.id = `${titleId}-move-help`
    this.resizeHelp.id = `${titleId}-resize-help`
    for (const help of [this.moveHelp, this.resizeHelp]) {
      help.className = 'visually-hidden popup-instructions'
      help.hidden = true
    }
    this.move.setAttribute('aria-describedby', this.moveHelp.id)
    this.resize.setAttribute('aria-describedby', this.resizeHelp.id)
    panel.querySelector('header')!.prepend(this.move)
    panel.querySelector('.header-actions')!.append(this.resize, this.close)
    this.grip.className = 'resize-grip'
    this.grip.setAttribute('aria-hidden', 'true')
    this.grip.innerHTML = icon('M20 15l-5 5M20 9 9 20')
    panel.append(this.grip)
    surface.prepend(this.launcher, this.moveHelp, this.resizeHelp)
    this.launcher.addEventListener('click', (event) => {
      if (this.dragged && event.detail) return
      this.setOpen(!this.opened, true)
    })
    this.close.addEventListener('click', () => {
      this.setOpen(false, true)
    })
    panel.addEventListener('keydown', (event) => {
      if (this.enabled && event.key === 'Escape' && !event.isComposing && !event.defaultPrevented) {
        event.preventDefault()
        event.stopPropagation()
        this.setOpen(false, true)
      }
    })
    this.resize.addEventListener('click', () => {
      this.expanded = !this.expanded
      panel.toggleAttribute('data-expanded', this.expanded)
      panel.style.width = panel.style.height = ''
      this.placePanel()
    })
    this.resize.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      event.preventDefault()
      const step = event.shiftKey ? 40 : 10
      const rect = panel.getBoundingClientRect()
      const delta = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -step : step
      if (['ArrowLeft', 'ArrowRight'].includes(event.key))
        this.resizePanel(rect.right, rect.width + delta * this.inlineSign())
      else this.resizePanel(rect.right, undefined, rect.height + delta)
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
        height: rect.height,
        right: rect.right
      }
      this.grip.setPointerCapture(event.pointerId)
    })
    this.grip.addEventListener('pointermove', (event) => {
      const start = this.resizing
      if (!start || start.pointerId !== event.pointerId) return
      event.preventDefault()
      this.resizePanel(
        start.right,
        start.width + (event.clientX - start.x) * this.inlineSign(),
        start.height + event.clientY - start.y
      )
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

  configure(
    mode: 'inline' | 'popup',
    title: string,
    labels: WebMCPChatLabels,
    placement: 'end' | 'start'
  ) {
    const changed = this.enabled !== (mode === 'popup')
    const moved = this.placement !== placement
    if (changed) this.teardown()
    this.enabled = mode === 'popup'
    this.host.dataset.mode = mode
    if (moved) {
      this.placement = placement
      this.pinnedInline = true
      this.position = this.panelPosition = undefined
    }
    this.moveHelp.hidden = this.resizeHelp.hidden = !this.enabled
    this.launcher.hidden =
      this.move.hidden =
      this.resize.hidden =
      this.close.hidden =
      this.grip.hidden =
        !this.enabled
    this.launcher.setAttribute('aria-label', labels.openChat(title))
    this.move.setAttribute('aria-label', labels.moveChat)
    this.resize.setAttribute('aria-label', labels.resizeChat)
    this.close.setAttribute('aria-label', labels.closeChat)
    for (const control of [this.move, this.resize, this.close])
      control.title = control.getAttribute('aria-label')!
    this.moveHelp.textContent = labels.moveInstructions
    this.resizeHelp.textContent = labels.resizeInstructions
    this.panel.hidden = this.enabled && !this.opened
    if (this.enabled) {
      this.panel.setAttribute('role', 'dialog')
      this.surface.setAttribute('popover', 'manual')
    } else {
      this.panel.removeAttribute('role')
      this.panel.removeAttribute('data-expanded')
      this.surface.removeAttribute('popover')
      this.panel.style.cssText = ''
      this.expanded = false
    }
    this.launcher.setAttribute('aria-expanded', String(this.opened))
    if (this.host.isConnected && changed) this.connect()
    else if (moved) this.reposition()
  }

  connect() {
    if (!this.enabled) return
    // The browser hides a popover when its element leaves the document.
    this.surface.showPopover()
    if (this.active) {
      this.reposition()
      return
    }
    this.active = true
    this.panel.hidden = !this.opened
    this.launcher.setAttribute('aria-expanded', String(this.opened))
    window.addEventListener('resize', this.onViewportChanged)
    window.visualViewport?.addEventListener('resize', this.onViewportChanged)
    window.visualViewport?.addEventListener('scroll', this.onViewportChanged)
    this.observer.observe(this.surface)
    this.observer.observe(this.launcher)
    this.observer.observe(this.panel)
    this.reposition()
  }

  disconnect() {
    // Defer cleanup so moving the element within the document keeps an open popup open.
    queueMicrotask(() => {
      if (!this.host.isConnected) this.teardown()
    })
  }

  get isOpen(): boolean {
    return this.opened
  }

  toggle() {
    this.setOpen(!this.opened)
  }

  /**
   * `userAction` marks a close the user asked for (Close, Escape, launcher), which always returns focus
   * to the launcher. WebKit does not focus a clicked button, so focus cannot be inferred then.
   * A programmatic close moves focus only if it was inside the chat.
   */
  setOpen(open: boolean, userAction = false) {
    if (!this.enabled || open === this.opened) return
    const focused = userAction || this.host.contains(this.host.ownerDocument.activeElement)
    this.opened = open
    this.panel.hidden = !open
    this.launcher.setAttribute('aria-expanded', String(open))
    if (open) {
      this.placePanel()
      this.panel
        .querySelector<HTMLElement>('.settings-panel:not([hidden]) button, textarea')!
        .focus({ preventScroll: true })
    } else if (focused) this.launcher.focus({ preventScroll: true })
    this.host.dispatchEvent(
      new CustomEvent('webmcp-chat-toggle', { detail: { open }, bubbles: true, composed: true })
    )
  }

  private teardown() {
    this.drag = undefined
    this.resizing = undefined
    this.observer.disconnect()
    window.removeEventListener('resize', this.onViewportChanged)
    window.visualViewport?.removeEventListener('resize', this.onViewportChanged)
    window.visualViewport?.removeEventListener('scroll', this.onViewportChanged)
    if (this.active) this.surface.hidePopover()
    this.active = false
    this.opened = false
  }

  private rtl(): boolean {
    return getComputedStyle(this.host).direction === 'rtl'
  }

  private inlineSign(): number {
    return this.rtl() ? -1 : 1
  }

  /** Whether the launcher's home side is the physical right edge. */
  private pinRight(): boolean {
    return (this.placement === 'end') !== this.rtl()
  }

  /** The `--webmcp-chat-offset` gap in pixels, resolved through the surface padding. */
  private offset(): number {
    return parseFloat(getComputedStyle(this.surface).paddingTop) || 0
  }

  private resizePanel(right: number, width?: number, height?: number) {
    const scale = this.scale(this.panel)
    if (width !== undefined) this.panel.style.width = `${Math.max(0, width) / scale}px`
    if (height !== undefined) this.panel.style.height = `${Math.max(0, height) / scale}px`
    // Right-to-left resizing grows toward the left, so keep a placed panel's right edge.
    if (this.panelPosition && this.rtl())
      this.panelPosition = {
        x: right - this.panel.getBoundingClientRect().width,
        y: this.panelPosition.y
      }
    this.placePanel()
  }

  private moveTo(control: HTMLElement, position: PopupPosition) {
    if (control === this.launcher) {
      this.position = this.place(this.launcher, position)
      const rect = this.launcher.getBoundingClientRect()
      const offset = this.offset()
      this.pinnedInline = this.pinRight()
        ? Math.abs(rect.right - innerWidth + offset) < 2
        : Math.abs(rect.left - offset) < 2
      this.pinnedBottom = Math.abs(rect.bottom - innerHeight + offset) < 2
      this.panelPosition = undefined
      this.placePanel()
    } else this.panelPosition = this.place(this.panel, position)
  }

  private reposition() {
    if (!this.enabled || !this.host.isConnected) return
    this.position = this.place(this.launcher, {
      x: this.pinnedInline ? (this.pinRight() ? innerWidth : 0) : (this.position?.x ?? innerWidth),
      y: this.pinnedBottom ? innerHeight : (this.position?.y ?? innerHeight)
    })
    if (this.opened) this.placePanel()
  }

  private placePanel() {
    if (!this.opened) return
    const viewport = window.visualViewport
    const scale = this.scale(this.panel)
    const offset = this.offset()
    this.panel.style.setProperty(
      '--webmcp-popup-available-width',
      `${((viewport?.width ?? innerWidth) - offset * 2) / scale}px`
    )
    this.panel.style.setProperty(
      '--webmcp-popup-available-height',
      `${((viewport?.height ?? innerHeight) - offset * 2) / scale}px`
    )
    const launcher = this.launcher.getBoundingClientRect()
    const panel = this.panel.getBoundingClientRect()
    this.place(
      this.panel,
      this.panelPosition ?? {
        x: this.pinRight() ? launcher.right - panel.width : launcher.left,
        y:
          launcher.top > innerHeight - launcher.bottom
            ? launcher.top - panel.height - offset
            : launcher.bottom + offset
      }
    )
  }

  private scale(element: HTMLElement): number {
    return element.getBoundingClientRect().width / parseFloat(getComputedStyle(element).width) || 1
  }

  private place(element: HTMLElement, position: PopupPosition): PopupPosition {
    const viewport = window.visualViewport
    const offset = this.offset()
    const left = (viewport?.offsetLeft ?? 0) + offset
    const top = (viewport?.offsetTop ?? 0) + offset
    const rect = element.getBoundingClientRect()
    const x = Math.max(
      left,
      Math.min(position.x, left + (viewport?.width ?? innerWidth) - rect.width - offset * 2)
    )
    const y = Math.max(
      top,
      Math.min(position.y, top + (viewport?.height ?? innerHeight) - rect.height - offset * 2)
    )
    const scale = this.scale(element)
    element.style.left = `${x / scale}px`
    element.style.top = `${y / scale}px`
    return { x, y }
  }
}
