import type { PiController, PiSnapshot } from '@vampaz/webmcp-kit/pi'
export function fakeController(): PiController {
  let snapshot: PiSnapshot = { state: 'idle', messages: [] }
  const listeners = new Set<(snapshot: PiSnapshot) => void>()
  return {
    getSnapshot() {
      return snapshot
    },
    subscribe(listener) {
      listeners.add(listener)
      listener(snapshot)
      return function unsubscribe() {
        listeners.delete(listener)
      }
    },
    async send(text) {
      snapshot = {
        state: 'idle',
        messages: [
          { id: '1', role: 'user', text },
          { id: '2', role: 'assistant', text: 'Fake controller response' }
        ]
      }
      for (const listener of listeners) listener(snapshot)
      return { status: 'completed' }
    },
    async stop() {},
    async clear() {},
    async destroy() {}
  }
}
