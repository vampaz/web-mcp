import { locks } from 'node:worker_threads'
import { IDBFactory } from 'fake-indexeddb'
import { vi } from 'vitest'

export function installBrowserStorage() {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('navigator', { locks })
}
