import { describe, expect, it } from 'vitest'

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
})
