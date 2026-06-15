import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getSupportLabel, getWebMCPModelContext, isWebMCPSupported } from './support'

interface NavigatorWithModelContext extends Navigator {
  modelContext?: {
    registerTool?: unknown
  }
}

interface DocumentWithModelContext extends Document {
  modelContext?: {
    registerTool?: unknown
  }
}

describe('WebMCP support detection', () => {
  beforeEach(() => {
    delete (document as DocumentWithModelContext).modelContext
    delete (navigator as NavigatorWithModelContext).modelContext
  })

  afterEach(() => {
    delete (document as DocumentWithModelContext).modelContext
    delete (navigator as NavigatorWithModelContext).modelContext
  })

  it('reports fallback mode when native registration is missing', () => {
    expect(isWebMCPSupported()).toBe(false)
    expect(getSupportLabel()).toBe('Fallback registry active')
  })

  it('reports native mode when document registerTool is available', () => {
    ;(document as DocumentWithModelContext).modelContext = {
      registerTool() {
        return undefined
      }
    }

    expect(isWebMCPSupported()).toBe(true)
    expect(getSupportLabel()).toBe('Native WebMCP available')
  })

  it('reports native mode for the legacy navigator registerTool fallback', () => {
    ;(navigator as NavigatorWithModelContext).modelContext = {
      registerTool() {
        return undefined
      }
    }

    expect(isWebMCPSupported()).toBe(true)
    expect(getSupportLabel()).toBe('Native WebMCP available')
  })

  it('prefers document modelContext over the legacy navigator fallback', () => {
    const documentContext = {
      registerTool() {
        return undefined
      }
    }
    const navigatorContext = {
      registerTool() {
        return undefined
      }
    }

    ;(document as DocumentWithModelContext).modelContext = documentContext
    ;(navigator as NavigatorWithModelContext).modelContext = navigatorContext

    expect(getWebMCPModelContext()).toBe(documentContext)
  })
})
