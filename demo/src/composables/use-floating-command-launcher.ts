import { onMounted, onUnmounted, ref, type Ref } from 'vue'

import type { WebMCPCommandInputElement } from 'webmcp-kit'

export interface LauncherViewport {
  height: number
  width: number
}

export interface LauncherSize {
  height: number
  width: number
}

export interface LauncherPosition {
  x: number
  y: number
}

export interface LauncherBounds {
  maxX: number
  maxY: number
}

export interface LauncherViewportChange {
  pinnedBottom: boolean
  pinnedRight: boolean
  position: LauncherPosition
}

export interface PanelPlacement {
  bottom?: number
  left: number
  maxHeight: number
  top?: number
}

export interface UseFloatingCommandLauncherOptions {
  getPanelElement: () => WebMCPCommandInputElement | null
  onActivate: () => void
}

export interface UseFloatingCommandLauncherResult {
  handleLauncherClicked: () => void
  handleLauncherDragStarted: (event: PointerEvent) => void
  launcher: Ref<HTMLButtonElement | null>
  syncLauncherPosition: () => void
  updatePanelPlacement: () => void
}

interface LauncherDragState {
  hasMoved: boolean
  offsetX: number
  offsetY: number
  pointerId: number
}

export const launcherViewportMargin = 8
export const launcherPinTolerance = 2
export const launcherDragThreshold = 3

export function getLauncherBounds(viewport: LauncherViewport, size: LauncherSize): LauncherBounds {
  return {
    maxX: Math.max(launcherViewportMargin, viewport.width - size.width - launcherViewportMargin),
    maxY: Math.max(launcherViewportMargin, viewport.height - size.height - launcherViewportMargin)
  }
}

export function clampLauncherPosition(
  position: LauncherPosition,
  bounds: LauncherBounds
): LauncherPosition {
  return {
    x: Math.min(Math.max(launcherViewportMargin, position.x), bounds.maxX),
    y: Math.min(Math.max(launcherViewportMargin, position.y), bounds.maxY)
  }
}

export function isPinnedToEdge(value: number, max: number): boolean {
  return Math.abs(value - max) <= launcherPinTolerance
}

export function resolveLauncherViewportChange(state: {
  nextBounds: LauncherBounds
  pinnedBottom: boolean
  pinnedRight: boolean
  position: LauncherPosition
  previousBounds: LauncherBounds
}): LauncherViewportChange {
  const pinnedRight =
    state.pinnedRight || isPinnedToEdge(state.position.x, state.previousBounds.maxX)
  const pinnedBottom =
    state.pinnedBottom || isPinnedToEdge(state.position.y, state.previousBounds.maxY)
  const position = clampLauncherPosition(
    {
      x: pinnedRight ? state.nextBounds.maxX : state.position.x,
      y: pinnedBottom ? state.nextBounds.maxY : state.position.y
    },
    state.nextBounds
  )

  return {
    pinnedBottom,
    pinnedRight,
    position
  }
}

export function getPanelPlacement(input: {
  launcherRect: { bottom: number; left: number; right: number; top: number }
  panelHeight: number
  panelWidth: number
  viewport: LauncherViewport
}): PanelPlacement {
  const { launcherRect, panelHeight, panelWidth, viewport } = input
  const margin = launcherViewportMargin
  const spaceAbove = launcherRect.top - margin
  const spaceBelow = viewport.height - launcherRect.bottom - margin
  const spaceLeft = launcherRect.right - margin
  const spaceRight = viewport.width - launcherRect.left - margin
  const vertical = spaceBelow >= panelHeight || spaceBelow >= spaceAbove ? 'down' : 'up'
  const horizontal = spaceRight >= panelWidth || spaceRight >= spaceLeft ? 'right' : 'left'
  const maxHeight = Math.max(0, vertical === 'down' ? spaceBelow - margin : spaceAbove - margin)
  const left =
    horizontal === 'right'
      ? Math.min(launcherRect.left, viewport.width - panelWidth - margin)
      : Math.max(margin, launcherRect.right - panelWidth)

  if (vertical === 'down') {
    return {
      left,
      maxHeight,
      top: Math.min(launcherRect.bottom + margin, viewport.height - panelHeight - margin)
    }
  }

  return {
    bottom: Math.max(margin, viewport.height - launcherRect.top + margin),
    left,
    maxHeight
  }
}

export function useFloatingCommandLauncher(
  options: UseFloatingCommandLauncherOptions
): UseFloatingCommandLauncherResult {
  const launcher = ref<HTMLButtonElement | null>(null)
  let dragState: LauncherDragState | undefined
  let pinnedBottom = true
  let pinnedRight = true
  let position: LauncherPosition = {
    x: 24,
    y: 96
  }
  let viewport: LauncherViewport = {
    height: 0,
    width: 0
  }
  let wasPositioned = false

  function handleLauncherClicked() {
    if (dragState?.hasMoved) return
    options.onActivate()
  }

  function handleLauncherDragStarted(event: PointerEvent) {
    if (!(event.currentTarget instanceof HTMLElement)) return
    event.preventDefault()
    syncLauncherPosition()
    const rect = event.currentTarget.getBoundingClientRect()
    dragState = {
      hasMoved: false,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      pointerId: event.pointerId
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic pointer events do not always have an active pointer to capture.
    }
    window.addEventListener('pointermove', handleLauncherDragged)
    window.addEventListener('pointerup', handleLauncherDragEnded)
    window.addEventListener('pointercancel', handleLauncherDragEnded)
  }

  function handleLauncherDragged(event: PointerEvent) {
    if (!dragState || event.pointerId !== dragState.pointerId) return
    event.preventDefault()
    const nextX = event.clientX - dragState.offsetX
    const nextY = event.clientY - dragState.offsetY
    const deltaX = Math.abs(nextX - position.x)
    const deltaY = Math.abs(nextY - position.y)
    const bounds = getCurrentBounds()
    const nextPosition = clampLauncherPosition({ x: nextX, y: nextY }, bounds)

    if (deltaX > launcherDragThreshold || deltaY > launcherDragThreshold) dragState.hasMoved = true
    position = nextPosition
    pinnedRight = isPinnedToEdge(nextPosition.x, bounds.maxX)
    pinnedBottom = isPinnedToEdge(nextPosition.y, bounds.maxY)
    syncLauncherPosition()
    updatePanelPlacement()
  }

  function handleLauncherDragEnded(event: PointerEvent) {
    if (!dragState || event.pointerId !== dragState.pointerId) return
    window.removeEventListener('pointermove', handleLauncherDragged)
    window.removeEventListener('pointerup', handleLauncherDragEnded)
    window.removeEventListener('pointercancel', handleLauncherDragEnded)
    window.setTimeout(function clearLauncherDragState() {
      dragState = undefined
    }, 0)
  }

  function handleViewportChanged() {
    const size = getLauncherSize()
    const previousBounds = getLauncherBounds(viewport, size)
    viewport = getCurrentViewport()
    const change = resolveLauncherViewportChange({
      nextBounds: getLauncherBounds(viewport, size),
      pinnedBottom,
      pinnedRight,
      position,
      previousBounds
    })

    pinnedBottom = change.pinnedBottom
    pinnedRight = change.pinnedRight
    position = change.position
    syncLauncherPosition()
    updatePanelPlacement()
  }

  function syncLauncherPosition() {
    const element = launcher.value
    if (!element) return
    if (!wasPositioned) setInitialLauncherPosition()

    element.style.left = `${position.x}px`
    element.style.top = `${position.y}px`
    element.style.right = 'auto'
    element.style.bottom = 'auto'
  }

  function setInitialLauncherPosition() {
    const bounds = getCurrentBounds()
    position = {
      x: bounds.maxX,
      y: bounds.maxY
    }
    pinnedRight = true
    pinnedBottom = true
    viewport = getCurrentViewport()
    wasPositioned = true
  }

  function updatePanelPlacement() {
    const element = options.getPanelElement()
    const launcherElement = launcher.value
    if (!element || !launcherElement || !element.panelOpen) return

    const placement = getPanelPlacement({
      launcherRect: launcherElement.getBoundingClientRect(),
      panelHeight: Math.min(element.scrollHeight || 320, window.innerHeight - 16),
      panelWidth: Math.min(element.scrollWidth || 920, window.innerWidth - 16),
      viewport: getCurrentViewport()
    })

    element.style.left = `${placement.left}px`
    element.style.removeProperty('right')
    element.style.setProperty('--webmcp-floating-panel-max-height', `${placement.maxHeight}px`)

    if (placement.top !== undefined) {
      element.style.top = `${placement.top}px`
      element.style.removeProperty('bottom')
      return
    }

    element.style.bottom = `${placement.bottom}px`
    element.style.removeProperty('top')
  }

  function getLauncherSize(): LauncherSize {
    return {
      height: launcher.value?.offsetHeight || 0,
      width: launcher.value?.offsetWidth || 0
    }
  }

  function getCurrentBounds(): LauncherBounds {
    return getLauncherBounds(getCurrentViewport(), getLauncherSize())
  }

  function getCurrentViewport(): LauncherViewport {
    return {
      height: window.innerHeight,
      width: window.innerWidth
    }
  }

  onMounted(function mountFloatingCommandLauncher() {
    window.addEventListener('resize', handleViewportChanged)
    viewport = getCurrentViewport()
    syncLauncherPosition()
  })

  onUnmounted(function unmountFloatingCommandLauncher() {
    window.removeEventListener('resize', handleViewportChanged)
    window.removeEventListener('pointermove', handleLauncherDragged)
    window.removeEventListener('pointerup', handleLauncherDragEnded)
    window.removeEventListener('pointercancel', handleLauncherDragEnded)
  })

  return {
    handleLauncherClicked,
    handleLauncherDragStarted,
    launcher,
    syncLauncherPosition,
    updatePanelPlacement
  }
}
