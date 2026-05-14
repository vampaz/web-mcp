import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getSupportLabel, isWebMCPSupported } from './support'

interface NavigatorWithModelContext extends Navigator {
  modelContext?: {
    registerTool?: unknown
  }
}

describe('WebMCP support detection', () => {
  beforeEach(() => {
    delete (navigator as NavigatorWithModelContext).modelContext
  })

  afterEach(() => {
    delete (navigator as NavigatorWithModelContext).modelContext
  })

  it('reports fallback mode when native registration is missing', () => {
    expect(isWebMCPSupported()).toBe(false)
    expect(getSupportLabel()).toBe('Fallback registry active')
  })

  it('reports native mode when registerTool is available', () => {
    ;(navigator as NavigatorWithModelContext).modelContext = {
      registerTool() {
        return undefined
      }
    }

    expect(isWebMCPSupported()).toBe(true)
    expect(getSupportLabel()).toBe('Native WebMCP available')
  })
})
