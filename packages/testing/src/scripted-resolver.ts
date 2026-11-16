import type {
  ResolverContext,
  ResolverRunOptions,
  ToolResolution,
  ToolResolver
} from '@vampaz/webmcp-kit'
import { raceAbort } from '../../core/src/abort'

export interface ScriptedResolverCall {
  message: string
  context: ResolverContext
  options?: ResolverRunOptions
}

export type ScriptedResolverMatch = string | RegExp | ((call: ScriptedResolverCall) => boolean)

export type ScriptedResolverResolution =
  | ToolResolution
  | ((call: ScriptedResolverCall) => ToolResolution | Promise<ToolResolution>)

export interface ScriptedResolverStep {
  /** Defaults to every message. A string matches the full message exactly. */
  match?: ScriptedResolverMatch
  /** Calls this step handles before it is exhausted. Defaults to 1. */
  times?: number
  /** Keep this step available for every matching call. Do not combine with times. */
  repeat?: boolean
  resolution?: ScriptedResolverResolution
  error?: Error | string
  /** Wait for the call's AbortSignal, then reject with a cancellation error. */
  waitForAbort?: boolean
}

export interface ScriptedResolverOptions {
  name?: string
  detail?: string
  steps?: readonly ScriptedResolverStep[]
  /** Handles calls after no scripted step matches. Without it, exhaustion throws. */
  fallback?: (call: ScriptedResolverCall) => ToolResolution | Promise<ToolResolution>
}

/** A deterministic scripted response, cancellation, or exhaustion failure. */
export class ScriptedResolverError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScriptedResolverError'
  }
}

/**
 * Builds a deterministic resolver for tests and local fixtures. Scripts are consumed in order.
 * The helper does not validate resolutions; the normal Pi or command-input path still does.
 */
export function createScriptedResolver(options: ScriptedResolverOptions = {}): ToolResolver {
  const steps = (options.steps ?? []).map(validateStep)
  const fallback = options.fallback

  return {
    name: options.name ?? 'Scripted resolver',
    detail: options.detail ?? 'Deterministic scripted responses for tests.',
    capabilities: { conversation: true },
    available: true,
    status: 'ready',
    async resolve(message, _tools, context = {}, runOptions): Promise<ToolResolution> {
      const signal = runOptions?.signal
      if (signal?.aborted) throw cancelled()
      const call: ScriptedResolverCall = {
        message,
        context,
        ...(runOptions ? { options: runOptions } : {})
      }
      const index = steps.findIndex(function matches(step) {
        return step.remaining > 0 && matchesStep(step.match, call)
      })

      if (index < 0) {
        if (fallback)
          return settle(
            Promise.resolve().then(() => fallback(call)),
            signal
          )
        throw new ScriptedResolverError('The scripted resolver has no response left.')
      }

      const step = steps[index]!
      if (!step.repeat) {
        step.remaining -= 1
        if (step.remaining === 0) steps.splice(index, 1)
      }

      if (step.waitForAbort) {
        await waitForAbort(signal)
        throw new ScriptedResolverError('The scripted resolver wait ended without cancellation.')
      }
      if (step.error !== undefined) {
        throw typeof step.error === 'string' ? new ScriptedResolverError(step.error) : step.error
      }
      const resolution = step.resolution!
      if (typeof resolution === 'function')
        return settle(
          Promise.resolve().then(() => resolution(call)),
          signal
        )
      return resolution
    }
  }
}

interface PreparedStep extends ScriptedResolverStep {
  remaining: number
}

function validateStep(step: ScriptedResolverStep): PreparedStep {
  if (!step || typeof step !== 'object')
    throw new ScriptedResolverError('Each scripted resolver step must be an object.')
  const responses = [
    step.resolution !== undefined,
    step.error !== undefined,
    step.waitForAbort === true
  ].filter(Boolean).length
  if (responses !== 1)
    throw new ScriptedResolverError(
      'Each scripted resolver step must define exactly one of resolution, error, or waitForAbort.'
    )
  if (step.times !== undefined && (!Number.isInteger(step.times) || step.times < 1))
    throw new ScriptedResolverError('Scripted step times must be a positive integer.')
  if (step.repeat !== undefined && typeof step.repeat !== 'boolean')
    throw new ScriptedResolverError('Scripted step repeat must be a boolean.')
  if (step.repeat === true && step.times !== undefined)
    throw new ScriptedResolverError('Scripted step repeat cannot be combined with times.')
  return { ...step, remaining: step.times ?? 1 }
}

function matchesStep(
  match: ScriptedResolverMatch | undefined,
  call: ScriptedResolverCall
): boolean {
  if (match === undefined) return true
  if (typeof match === 'string') return call.message === match
  if (match instanceof RegExp) {
    match.lastIndex = 0
    return match.test(call.message)
  }
  return match(call)
}

async function waitForAbort(signal: AbortSignal | undefined): Promise<void> {
  if (!signal) throw new ScriptedResolverError('A scripted wait requires a cancellation signal.')
  if (signal.aborted) throw cancelled()
  await new Promise<void>(function wait(_resolve, reject) {
    signal.addEventListener(
      'abort',
      function abort() {
        reject(cancelled())
      },
      { once: true }
    )
  })
}

async function settle<T>(pending: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  try {
    return await raceAbort(pending, signal, 'Scripted resolver request was cancelled.')
  } catch (error) {
    if (signal?.aborted) throw cancelled()
    throw error
  }
}

function cancelled(): ScriptedResolverError {
  return new ScriptedResolverError('Scripted resolver request was cancelled.')
}
