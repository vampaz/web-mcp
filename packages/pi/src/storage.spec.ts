// @vitest-environment node
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { openPiStorage, clearPiStorage } from './storage'
import { installBrowserStorage } from './test-utils/browser'

beforeEach(installBrowserStorage)
afterEach(function cleanup() {
  vi.unstubAllGlobals()
})
it('commits a real IndexedDB transaction and replays its sequence', async function test() {
  const storage = await openPiStorage('test-storage', 65536)
  const first = await storage.commit([], BACKGROUND_CONTEXT)
  await storage.close(BACKGROUND_CONTEXT)
  const reopened = await openPiStorage('test-storage', 65536)
  expect(await reopened.commit([], BACKGROUND_CONTEXT)).not.toBe(first)
  await reopened.close(BACKGROUND_CONTEXT)
  await clearPiStorage('test-storage')
})
it('reports unavailable storage rather than using ephemeral memory', async function test() {
  vi.stubGlobal('indexedDB', {
    open() {
      throw new Error('blocked')
    }
  })
  await expect(openPiStorage('blocked', 65536)).rejects.toMatchObject({ code: 'storage_failed' })
})
