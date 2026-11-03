import { expect, it } from 'vitest'
import { transitionCommand, transitionCommandResolver } from './command-state'

it('allows only ordered command progress and retains ownership through result delivery', function command() {
  const controller = new AbortController()
  const preparing = transitionCommand({ kind: 'idle' }, { type: 'start', controller })
  expect(transitionCommand(preparing, { type: 'progress', phase: 'executing' })).toBe(preparing)
  const resolving = transitionCommand(preparing, { type: 'progress', phase: 'resolving' })
  const stopping = transitionCommand(resolving, { type: 'cancel' })
  expect(transitionCommand(stopping, { type: 'progress', phase: 'executing' })).toBe(stopping)
  const settling = transitionCommand(stopping, { type: 'settle', phase: 'failed' })
  expect(transitionCommand(settling, { type: 'start', controller: new AbortController() })).toBe(
    settling
  )
  expect(transitionCommand(settling, { type: 'release' })).toEqual({ kind: 'failed' })
})

it('does not resurrect a superseded resolver or remove a newer creation', function resolver() {
  const resolver = {
    name: 'test',
    available: true,
    status: 'ready' as const,
    detail: '',
    async resolve() {
      throw new Error('Unused')
    }
  }
  const promise = Promise.resolve(resolver)
  const creating = transitionCommandResolver(
    { kind: 'empty', revision: 0 },
    { type: 'create', promise }
  )
  const invalidated = transitionCommandResolver(creating, { type: 'invalidate' })
  expect(transitionCommandResolver(invalidated, { type: 'resolve', revision: 0, resolver })).toBe(
    invalidated
  )
  const next = transitionCommandResolver(invalidated, {
    type: 'create',
    promise: Promise.resolve(resolver)
  })
  expect(transitionCommandResolver(next, { type: 'reject', promise })).toBe(next)
  expect(transitionCommandResolver(next, { type: 'resolve', revision: 1, resolver })).toEqual({
    kind: 'ready',
    revision: 1,
    resolver
  })
})
