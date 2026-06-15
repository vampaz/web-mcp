import { describe, expect, it, vi } from 'vitest'

import { emitWebMCPKitEvent, subscribeWebMCPKitEvents } from './events'

describe('WebMCP Kit events', () => {
  it('subscribes and unsubscribes event listeners', () => {
    const events: string[] = []
    const unsubscribe = subscribeWebMCPKitEvents(function handleEvent(event) {
      events.push(event.type)
    })

    emitWebMCPKitEvent({
      type: 'registered',
      toolName: 'search_products',
      timestamp: 1
    })
    unsubscribe()
    emitWebMCPKitEvent({
      type: 'unregistered',
      toolName: 'search_products',
      timestamp: 2
    })

    expect(events).toEqual(['registered'])
  })

  it('keeps notifying listeners when one listener fails', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(function ignoreError() {})
    const events: string[] = []

    const unsubscribeFailed = subscribeWebMCPKitEvents(function failListener() {
      throw new Error('listener failed')
    })
    const unsubscribeTracked = subscribeWebMCPKitEvents(function handleEvent(event) {
      events.push(event.type)
    })

    expect(function emitEvent() {
      emitWebMCPKitEvent({
        type: 'registered',
        toolName: 'search_products',
        timestamp: 1
      })
    }).not.toThrow()
    expect(events).toEqual(['registered'])
    expect(consoleError).toHaveBeenCalledOnce()

    unsubscribeFailed()
    unsubscribeTracked()
    consoleError.mockRestore()
  })
})
