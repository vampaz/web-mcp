import { createPiRuntime, createRegistryToolHost, type PiController } from '@vampaz/webmcp-kit/pi'
import type { StorageFixture } from '../interfaces/storage-fixture'
import { createFixturePlanner } from './planner'

export function installStorageFixture() {
  const controllers = new Map<string, PiController>()
  const observations: boolean[] = []
  const committedEntries = new Map<string, Set<string>>()
  const namespace = 'webmcp-kit-storage-fixture'
  const originalTransaction = IDBDatabase.prototype.transaction
  const originalAdd = IDBObjectStore.prototype.add
  const originalClear = IDBObjectStore.prototype.clear
  const writes = new WeakMap<IDBTransaction, string[]>()
  const clears = new WeakSet<IDBTransaction>()
  IDBDatabase.prototype.transaction = function observeTransaction(storeNames, mode, options) {
    const transaction = originalTransaction.call(this, storeNames, mode, options)
    if (mode === 'readwrite' && this.name.startsWith('webmcp-kit-pi-v1:')) {
      const name = this.name
      writes.set(transaction, [])
      // Register before the adapter's completion callback, so the observation precedes publication.
      transaction.addEventListener(
        'complete',
        function committed() {
          const entries = clears.has(transaction)
            ? new Set<string>()
            : (committedEntries.get(name) ?? new Set<string>())
          for (const id of writes.get(transaction) ?? []) entries.add(id)
          committedEntries.set(name, entries)
        },
        { once: true }
      )
    }
    return transaction
  }
  IDBObjectStore.prototype.add = function observe(value, key) {
    const request = originalAdd.call(this, value, key)
    if (this.name === 'commits') {
      const commit = value as { writes: { type: string; value?: { id?: string } }[] }
      for (const write of commit.writes)
        if (write.type === 'entry' && write.value?.id !== undefined)
          writes.get(this.transaction)?.push(String(write.value.id))
    }
    return request
  }
  IDBObjectStore.prototype.clear = function observeClear() {
    clears.add(this.transaction)
    return originalClear.call(this)
  }
  window.addEventListener(
    'pagehide',
    function restore() {
      IDBDatabase.prototype.transaction = originalTransaction
      IDBObjectStore.prototype.add = originalAdd
      IDBObjectStore.prototype.clear = originalClear
    },
    { once: true }
  )
  const api: StorageFixture = {
    async open(label, owner, conversation, limits) {
      const controller = await createPiRuntime({
        session: { namespace, ownerId: owner, conversationId: conversation },
        planner: createFixturePlanner(),
        host: createRegistryToolHost(),
        limits
      })
      controllers.set(label, controller)
      controller.subscribe(function committed(snapshot) {
        if (!snapshot.messages.length) return
        const entries = committedEntries.get(
          `webmcp-kit-pi-v1:${JSON.stringify([namespace, owner, conversation])}`
        )
        observations.push(
          snapshot.messages.every(function alreadyCommitted(message) {
            return entries?.has(message.id.slice(0, message.id.lastIndexOf(':'))) === true
          })
        )
      })
      return controller.getSnapshot()
    },
    async send(label, text) {
      return controllers.get(label)!.send(text)
    },
    async stop(label) {
      await controllers.get(label)!.stop()
    },
    async clear(label) {
      await controllers.get(label)!.clear()
    },
    async destroy(label) {
      await controllers.get(label)!.destroy()
      controllers.delete(label)
    },
    snapshot(label) {
      return controllers.get(label)!.getSnapshot()
    },
    async evidence() {
      return [...observations]
    },
    async evict(owner, conversation) {
      const name = `webmcp-kit-pi-v1:${JSON.stringify([namespace, owner, conversation])}`
      await new Promise<void>(function evict(resolve, reject) {
        const request = indexedDB.deleteDatabase(name)
        request.onsuccess = function deleted() {
          committedEntries.delete(name)
          resolve()
        }
        request.onerror = request.onblocked = function failed() {
          reject(new Error('Fixture storage eviction failed'))
        }
      })
    },
    async unavailable() {
      const open = indexedDB.open
      indexedDB.open = function fail() {
        throw new Error('Storage disabled by browser fixture')
      }
      try {
        return await api.open('unavailable', 'owner', 'unavailable')
      } finally {
        indexedDB.open = open
      }
    }
  }
  window.piStorageFixture = api
}
