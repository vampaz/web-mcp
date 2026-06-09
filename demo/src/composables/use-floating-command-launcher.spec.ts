import { describe, expect, it } from 'vitest'

import {
  clampLauncherPosition,
  getLauncherBounds,
  getPanelPlacement,
  isPinnedToEdge,
  resolveLauncherViewportChange
} from './use-floating-command-launcher'

const launcherSize = {
  height: 40,
  width: 64
}

describe('floating command launcher geometry', () => {
  it('computes bounds inside the viewport margin', () => {
    expect(getLauncherBounds({ height: 800, width: 1200 }, launcherSize)).toEqual({
      maxX: 1128,
      maxY: 752
    })
  })

  it('keeps bounds at the margin for tiny viewports', () => {
    expect(getLauncherBounds({ height: 20, width: 30 }, launcherSize)).toEqual({
      maxX: 8,
      maxY: 8
    })
  })

  it('clamps positions to the margin and bounds', () => {
    const bounds = { maxX: 1128, maxY: 752 }

    expect(clampLauncherPosition({ x: -50, y: -50 }, bounds)).toEqual({ x: 8, y: 8 })
    expect(clampLauncherPosition({ x: 5000, y: 5000 }, bounds)).toEqual({ x: 1128, y: 752 })
    expect(clampLauncherPosition({ x: 400, y: 300 }, bounds)).toEqual({ x: 400, y: 300 })
  })

  it('detects edge pinning within the tolerance', () => {
    expect(isPinnedToEdge(1128, 1128)).toBe(true)
    expect(isPinnedToEdge(1126, 1128)).toBe(true)
    expect(isPinnedToEdge(1125, 1128)).toBe(false)
  })

  it('keeps a pinned launcher on the edge when the viewport grows', () => {
    const change = resolveLauncherViewportChange({
      nextBounds: { maxX: 1528, maxY: 952 },
      pinnedBottom: true,
      pinnedRight: true,
      position: { x: 1128, y: 752 },
      previousBounds: { maxX: 1128, maxY: 752 }
    })

    expect(change).toEqual({
      pinnedBottom: true,
      pinnedRight: true,
      position: { x: 1528, y: 952 }
    })
  })

  it('re-detects pinning from the previous bounds when flags were lost', () => {
    const change = resolveLauncherViewportChange({
      nextBounds: { maxX: 900, maxY: 700 },
      pinnedBottom: false,
      pinnedRight: false,
      position: { x: 1127, y: 300 },
      previousBounds: { maxX: 1128, maxY: 752 }
    })

    expect(change.pinnedRight).toBe(true)
    expect(change.pinnedBottom).toBe(false)
    expect(change.position).toEqual({ x: 900, y: 300 })
  })

  it('keeps an unpinned launcher in place and clamps to the next bounds', () => {
    const change = resolveLauncherViewportChange({
      nextBounds: { maxX: 300, maxY: 200 },
      pinnedBottom: false,
      pinnedRight: false,
      position: { x: 400, y: 100 },
      previousBounds: { maxX: 1128, maxY: 752 }
    })

    expect(change.pinnedRight).toBe(false)
    expect(change.pinnedBottom).toBe(false)
    expect(change.position).toEqual({ x: 300, y: 100 })
  })

  it('places the panel below the launcher when there is room', () => {
    const placement = getPanelPlacement({
      launcherRect: { bottom: 140, left: 100, right: 164, top: 100 },
      panelHeight: 320,
      panelWidth: 600,
      viewport: { height: 900, width: 1400 }
    })

    expect(placement.top).toBe(148)
    expect(placement.bottom).toBeUndefined()
    expect(placement.left).toBe(100)
    expect(placement.maxHeight).toBe(744)
  })

  it('places the panel above the launcher when space below is short', () => {
    const placement = getPanelPlacement({
      launcherRect: { bottom: 880, left: 100, right: 164, top: 840 },
      panelHeight: 320,
      panelWidth: 600,
      viewport: { height: 900, width: 1400 }
    })

    expect(placement.bottom).toBe(68)
    expect(placement.top).toBeUndefined()
    expect(placement.maxHeight).toBe(824)
  })

  it('aligns the panel to the left edge of the viewport when needed', () => {
    const placement = getPanelPlacement({
      launcherRect: { bottom: 140, left: 1340, right: 1396, top: 100 },
      panelHeight: 320,
      panelWidth: 600,
      viewport: { height: 900, width: 1400 }
    })

    expect(placement.left).toBe(796)
  })
})
