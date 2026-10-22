import type { PiSession } from './interfaces/session'
import { PiFailure } from './errors'
import { piSessionKey } from './session'

export type PiConversationOwner = Pick<PiSession, 'namespace' | 'ownerId'>

/** Lists stored conversation IDs for one account partition, for example before sign-out. */
export async function listPiConversations(owner: PiConversationOwner): Promise<string[]> {
  const prefix = ownerPrefix(owner)
  if (typeof indexedDB?.databases !== 'function')
    throw new PiFailure('unsupported', 'This browser cannot list stored conversations.')
  const databases = await indexedDB.databases()
  return databases.flatMap(function conversation(database) {
    if (!database.name?.startsWith(prefix)) return []
    try {
      const [namespace, ownerId, conversationId] = JSON.parse(
        database.name.slice(database.name.indexOf(':') + 1)
      ) as string[]
      return namespace === owner.namespace && ownerId === owner.ownerId && conversationId
        ? [conversationId]
        : []
    } catch {
      return []
    }
  })
}

/**
 * Deletes every stored conversation for one account partition. Destroy that account's controllers
 * first; a conversation with an active operation is left in place and reported as busy.
 */
export async function deletePiConversations(owner: PiConversationOwner): Promise<void> {
  const busy: string[] = []
  for (const conversationId of await listPiConversations(owner)) {
    const key = piSessionKey({ ...owner, conversationId })
    const deleted = await navigator.locks.request(
      key,
      { ifAvailable: true },
      async function remove(lock) {
        if (!lock) return false
        await deleteDatabase(key)
        return true
      }
    )
    if (!deleted) busy.push(conversationId)
  }
  if (busy.length)
    throw new PiFailure(
      'conversation_busy',
      `${busy.length} conversation(s) are in use. Destroy their controllers, then delete again.`
    )
}

function ownerPrefix(owner: PiConversationOwner): string {
  const key = piSessionKey({ ...owner, conversationId: 'x' })
  // The session key ends with the JSON array ["namespace","ownerId","x"]; keep everything before "x".
  return key.slice(0, key.length - '"x"]'.length)
}

function deleteDatabase(key: string): Promise<void> {
  return new Promise(function remove(resolve, reject) {
    const request = indexedDB.deleteDatabase(key)
    request.onsuccess = function deleted() {
      resolve()
    }
    request.onerror = request.onblocked = function failed() {
      reject(new PiFailure('storage_failed', 'A stored conversation could not be deleted.'))
    }
  })
}
