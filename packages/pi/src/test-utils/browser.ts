import { IDBFactory } from 'fake-indexeddb'
import { vi } from 'vitest'

export function installBrowserStorage() {
  const held = new Set<string>()
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('navigator', {
    locks: {
      async request(
        name: string,
        _options: unknown,
        callback: (lock: unknown) => Promise<unknown>
      ) {
        if (held.has(name)) return callback(null)
        held.add(name)
        try {
          return await callback({ name })
        } finally {
          held.delete(name)
        }
      }
    }
  })
}
