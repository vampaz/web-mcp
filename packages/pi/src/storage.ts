import type { Context } from '@earendil-works/chord'
import { MemoryStorage, type Seq, type StorageWrite } from '@earendil-works/pi-durable'
import { jsonBytes, PiFailure } from './errors'

// shortcut: replay a bounded commit log into Pi's reference store; use a different backend for large histories.
export class PiBrowserStorage extends MemoryStorage {
  constructor(
    private readonly database: IDBDatabase,
    private bytes: number,
    private readonly maxBytes: number
  ) {
    super()
  }

  override async commit(writes: readonly StorageWrite[], _context: Context) {
    const prepared = this.prepareCommit(writes)
    const entry = { seq: prepared.seq, writes: prepared.writes }
    const size = jsonBytes(entry)
    if (this.bytes + size > this.maxBytes)
      throw new PiFailure(
        'limit_reached',
        'Conversation storage is full. Clear chat before continuing.'
      )
    try {
      const transaction = this.database.transaction('commits', 'readwrite', {
        durability: 'strict'
      })
      const complete = transactionComplete(transaction)
      transaction.objectStore('commits').add(entry)
      await complete
      this.bytes += size
      return prepared.apply()
    } catch {
      throw new PiFailure(
        'storage_failed',
        'Conversation could not be saved. Check browser storage, then reopen or clear chat.'
      )
    }
  }

  override async close(context: Context) {
    this.database.close()
    await super.close(context)
  }
}

export async function openPiStorage(key: string, maxBytes: number): Promise<PiBrowserStorage> {
  let database: IDBDatabase | undefined
  try {
    database = await openDatabase(key)
    const transaction = database.transaction('commits')
    const complete = transactionComplete(transaction)
    const request = transaction.objectStore('commits').getAll()
    await complete
    const commits = request.result as { seq: Seq; writes: readonly StorageWrite[] }[]
    const bytes = commits.reduce(function size(sum, entry) {
      return sum + jsonBytes(entry)
    }, 0)
    if (bytes > maxBytes)
      throw new PiFailure(
        'limit_reached',
        'Stored history exceeds the configured limit. Clear chat or increase the limit.'
      )
    const storage = new PiBrowserStorage(database, bytes, maxBytes)
    for (const commit of commits) storage.prepareCommit(commit.writes, commit.seq).apply()
    return storage
  } catch (error) {
    database?.close()
    if (error instanceof PiFailure) throw error
    throw new PiFailure(
      'storage_failed',
      'Conversation storage is unavailable. Check browser storage and reopen chat.'
    )
  }
}

export async function clearPiStorage(key: string): Promise<void> {
  let database: IDBDatabase | undefined
  try {
    database = await openDatabase(key)
    const transaction = database.transaction('commits', 'readwrite', { durability: 'strict' })
    const complete = transactionComplete(transaction)
    transaction.objectStore('commits').clear()
    await complete
  } catch {
    throw new PiFailure(
      'storage_failed',
      'Conversation could not be cleared. Check browser storage and try again.'
    )
  } finally {
    database?.close()
  }
}

function openDatabase(key: string): Promise<IDBDatabase> {
  return new Promise(function open(resolve, reject) {
    let failed = false
    const request = indexedDB.open(key, 1)
    request.onupgradeneeded = function upgrade() {
      request.result.createObjectStore('commits', { keyPath: 'seq' })
    }
    request.onsuccess = function opened() {
      const database = request.result
      if (failed) {
        database.close()
        return
      }
      database.onversionchange = function close() {
        database.close()
      }
      resolve(database)
    }
    request.onerror = function error() {
      failed = true
      reject(request.error)
    }
    request.onblocked = function blocked() {
      failed = true
      reject(new Error('Conversation database is blocked. Close other chats.'))
    }
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise(function wait(resolve, reject) {
    transaction.oncomplete = function complete() {
      resolve()
    }
    transaction.onabort = transaction.onerror = function failed() {
      reject(transaction.error ?? new Error('Storage transaction failed.'))
    }
  })
}
