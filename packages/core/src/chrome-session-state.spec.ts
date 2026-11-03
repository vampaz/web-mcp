import { expect, it } from 'vitest'
import { transitionChromeSession } from './chrome-session-state'
import type { LanguageModelSession } from './interfaces/chrome-session-state'

it('retries failed creation but never revives a disposed session', function disposal() {
  const session: LanguageModelSession = {
    async clone() {
      return session
    },
    async prompt() {
      return ''
    }
  }
  const promise = Promise.resolve(session)
  const creating = transitionChromeSession(
    { kind: 'empty', sessions: [] },
    { type: 'create', promise }
  )
  expect(transitionChromeSession(creating, { type: 'reject', promise })).toEqual({
    kind: 'empty',
    sessions: []
  })
  const ready = transitionChromeSession(creating, { type: 'resolve', promise, session })
  expect(transitionChromeSession(ready, { type: 'reject', promise })).toBe(ready)
  const disposed = transitionChromeSession(creating, { type: 'dispose' })
  expect(transitionChromeSession(disposed, { type: 'resolve', promise, session })).toBe(disposed)
  expect(transitionChromeSession(disposed, { type: 'create', promise })).toBe(disposed)
})
