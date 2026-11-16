import { describe, expect, it, vi } from 'vitest'
import type { ToolResolution, ToolResolver } from '@vampaz/webmcp-kit'
import {
  createScriptedResolver,
  ScriptedResolverError,
  type ScriptedResolverOptions
} from './scripted-resolver'

const read: ToolResolution = {
  toolName: 'read_counter',
  input: {},
  confidence: 1,
  reason: 'Read.'
}
const reply: ToolResolution = {
  toolName: 'pi_reply',
  input: { text: 'Reply' },
  confidence: 1,
  reason: 'Reply.'
}

function resolve(
  resolver: ToolResolver,
  message: string,
  options?: Parameters<ToolResolver['resolve']>[3]
) {
  return resolver.resolve(message, [], {}, options)
}

function build(options: ScriptedResolverOptions = {}) {
  return createScriptedResolver(options)
}

describe('scripted resolver', function scripted() {
  it('is a ready conversational resolver with test defaults', function defaults() {
    const resolver = build()
    expect(resolver.capabilities).toEqual({ conversation: true })
    expect(resolver.available).toBe(true)
    expect(resolver.status).toBe('ready')
    expect(resolver.name).toBe('Scripted resolver')
    expect(resolver.detail).toContain('Deterministic')
  })

  it('matches exact strings, regular expressions, and functions', async function matching() {
    const resolver = build({
      steps: [
        { match: 'exact', resolution: read },
        { match: /^regex:\d+$/, resolution: reply },
        {
          match(call) {
            return call.context.route === '/function'
          },
          resolution: { ...read, reason: 'Function.' }
        }
      ]
    })
    await expect(resolve(resolver, 'exact')).resolves.toEqual(read)
    await expect(resolve(resolver, 'regex:42')).resolves.toEqual(reply)
    await expect(resolver.resolve('anything', [], { route: '/function' })).resolves.toEqual({
      ...read,
      reason: 'Function.'
    })
    await expect(resolve(resolver, 'missing')).rejects.toThrow(ScriptedResolverError)
  })

  it('consumes steps deterministically and uses the fallback', async function consumption() {
    const resolver = build({
      steps: [{ match: 'twice', times: 2, resolution: read }, { resolution: reply }],
      fallback() {
        return { ...read, reason: 'Fallback.' }
      }
    })
    await expect(resolve(resolver, 'twice')).resolves.toEqual(read)
    await expect(resolve(resolver, 'twice')).resolves.toEqual(read)
    await expect(resolve(resolver, 'other')).resolves.toEqual(reply)
    await expect(resolve(resolver, 'again')).resolves.toEqual({
      ...read,
      reason: 'Fallback.'
    })
  })

  it('throws a deterministic exhaustion error without a fallback', async function exhaustion() {
    const resolver = build({ steps: [{ match: 'once', resolution: read }] })
    await expect(resolve(resolver, 'once')).resolves.toEqual(read)
    await expect(resolve(resolver, 'once')).rejects.toThrow(
      'The scripted resolver has no response left.'
    )
    await expect(resolve(resolver, 'other')).rejects.toThrow(
      'The scripted resolver has no response left.'
    )
  })

  it('returns resolution functions and unvalidated values', async function resolutions() {
    const invalid = { toolName: 'missing', input: {}, confidence: 1, reason: 'Invalid.' }
    const resolver = build({
      steps: [
        {
          resolution(call) {
            return { ...read, reason: call.message }
          }
        },
        { resolution: invalid }
      ]
    })
    await expect(resolve(resolver, 'computed')).resolves.toEqual({
      ...read,
      reason: 'computed'
    })
    await expect(resolve(resolver, 'invalid')).resolves.toEqual(invalid)
  })

  it('throws configured errors', async function errors() {
    const resolver = build({
      steps: [{ error: 'string failure' }, { error: new TypeError('typed failure') }]
    })
    await expect(resolve(resolver, 'one')).rejects.toThrow('string failure')
    await expect(resolve(resolver, 'two')).rejects.toThrow(TypeError)
  })

  it('keeps repeat steps available for every matching call', async function repeat() {
    const resolver = build({
      steps: [{ match: 'repeat', repeat: true, resolution: read }],
      fallback() {
        return reply
      }
    })
    await expect(resolve(resolver, 'repeat')).resolves.toEqual(read)
    await expect(resolve(resolver, 'repeat')).resolves.toEqual(read)
    await expect(resolve(resolver, 'other')).resolves.toEqual(reply)
  })

  it('checks a preaborted signal before consuming a step or fallback', async function preaborted() {
    const fallback = vi.fn(function fallback() {
      return reply
    })
    const resolver = build({
      steps: [{ match: 'one', resolution: read }],
      fallback
    })
    await expect(resolve(resolver, 'one', { signal: AbortSignal.abort() })).rejects.toThrow(
      'cancelled'
    )
    expect(fallback).not.toHaveBeenCalled()
    await expect(resolve(resolver, 'one')).resolves.toEqual(read)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('aborts a pending async resolution without an unhandled rejection', async function asyncResolution() {
    let finish!: (value: ToolResolution) => void
    const resolver = build({
      steps: [
        {
          resolution() {
            return new Promise<ToolResolution>(function wait(resolve) {
              finish = resolve
            })
          }
        }
      ]
    })
    const controller = new AbortController()
    const pending = resolve(resolver, 'async', { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toThrow('cancelled')
    finish(read)
    await Promise.resolve()
  })

  it('aborts a pending async fallback without an unhandled rejection', async function asyncFallback() {
    let finish!: (value: ToolResolution) => void
    const resolver = build({
      fallback() {
        return new Promise<ToolResolution>(function wait(resolve) {
          finish = resolve
        })
      }
    })
    const controller = new AbortController()
    const pending = resolve(resolver, 'async fallback', { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toThrow('cancelled')
    finish(reply)
    await Promise.resolve()
  })

  it('waits for cancellation and rejects', async function cancellation() {
    const resolver = build({ steps: [{ waitForAbort: true }] })
    const controller = new AbortController()
    const pending = resolve(resolver, 'wait', { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toThrow('Scripted resolver request was cancelled.')
  })

  it('rejects an already aborted wait and a wait without a signal', async function waitErrors() {
    const preaborted = build({ steps: [{ waitForAbort: true }] })
    await expect(resolve(preaborted, 'wait', { signal: AbortSignal.abort() })).rejects.toThrow(
      'Scripted resolver request was cancelled.'
    )
    const missing = build({ steps: [{ waitForAbort: true }] })
    await expect(resolve(missing, 'wait')).rejects.toThrow(
      'A scripted wait requires a cancellation signal.'
    )
  })

  it('validates step configuration', function configuration() {
    expect(function ambiguous() {
      build({ steps: [{ resolution: read, error: 'both' }] })
    }).toThrow('exactly one')
    expect(function empty() {
      build({ steps: [{}] })
    }).toThrow('exactly one')
    expect(function times() {
      build({ steps: [{ times: 0, resolution: read }] })
    }).toThrow('positive integer')
    expect(function repeatTimes() {
      build({ steps: [{ repeat: true, times: 2, resolution: read }] })
    }).toThrow('cannot be combined')
    expect(function repeatType() {
      build({ steps: [{ repeat: 'yes' as never, resolution: read }] })
    }).toThrow('must be a boolean')
    expect(function missing() {
      build({ steps: [null as never] })
    }).toThrow('must be an object')
  })
})
