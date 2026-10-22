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

  /** UTF-8 bytes in the durable commit log. */
  get usedBytes() {
    return this.bytes
  }

  override async commit(writes: readonly StorageWrite[], _context: Context) {
    const prepared = this.prepareCommit(writes)
    const size = jsonBytes({ seq: prepared.seq, writes: prepared.writes })
    // Stored with its size, so reopening does not serialize the whole log again.
    const entry = { seq: prepared.seq, writes: prepared.writes, bytes: size }
    if (this.bytes + size > this.maxBytes)
      throw new PiFailure(
        'limit_reached',
        'Conversation storage is full. Start a new chat before continuing.',
        { reason: 'history_bytes' }
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
    } catch (error) {
      if ((error as { name?: unknown })?.name === 'QuotaExceededError')
        throw new PiFailure(
          'storage_failed',
          'Browser storage is full. Free space or start a new chat before continuing.',
          { reason: 'storage_quota' }
        )
      throw new PiFailure(
        'storage_failed',
        'Conversation could not be saved. Check browser storage, then reopen or start a new chat.'
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
    const commits = request.result as {
      seq: Seq
      writes: readonly StorageWrite[]
      bytes?: number
    }[]
    const bytes = commits.reduce(function size(sum, entry) {
      // Commits saved before sizes were stored are measured once here.
      return sum + (entry.bytes ?? jsonBytes({ seq: entry.seq, writes: entry.writes }))
    }, 0)
    if (bytes > maxBytes)
      throw new PiFailure(
        'limit_reached',
        'Stored history exceeds the configured limit. Start a new chat or increase the limit.',
        { reason: 'history_bytes' }
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

/** Whether the conversation database exists; `undefined` when the browser cannot list databases. */
export async function piStorageExists(key: string): Promise<boolean | undefined> {
  if (typeof indexedDB.databases !== 'function') return undefined
  const databases = await indexedDB.databases()
  return databases.some(function matches(database) {
    return database.name === key
  })
}

/** Deletes the conversation database; its name contains the session partition, so it must not linger. */
export function clearPiStorage(key: string): Promise<void> {
  return new Promise(function remove(resolve, reject) {
    const request = indexedDB.deleteDatabase(key)
    request.onsuccess = function deleted() {
      resolve()
    }
    function failed() {
      reject(
        new PiFailure(
          'storage_failed',
          'Conversation could not be cleared. Close other chats for this conversation and try again.'
        )
      )
    }
    request.onerror = failed
    request.onblocked = failed
  })
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
