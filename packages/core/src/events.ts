import type { WebMCPKitEvent } from './interfaces/tool'

type Listener = (event: WebMCPKitEvent) => void

const listeners = new Set<Listener>()

/** Subscribes to registry and invocation events and returns an unsubscribe function. */
export function subscribeWebMCPKitEvents(listener: Listener): () => void {
  listeners.add(listener)

  return function unsubscribe() {
    listeners.delete(listener)
  }
}

export function emitWebMCPKitEvent(event: WebMCPKitEvent): void {
  for (const listener of listeners) {
    try {
      listener(event)
    } catch (error) {
      console.error('WebMCP Kit event listener failed.', error)
    }
  }
}
