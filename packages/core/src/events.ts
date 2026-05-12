import type { WebMCPKitEvent } from './interfaces/tool'

type Listener = (event: WebMCPKitEvent) => void

const listeners = new Set<Listener>()

export function subscribeWebMCPKitEvents(listener: Listener): () => void {
  listeners.add(listener)

  return function unsubscribe() {
    listeners.delete(listener)
  }
}

export function emitWebMCPKitEvent(event: WebMCPKitEvent): void {
  for (const listener of listeners) {
    listener(event)
  }
}
