import { getToolAvailability } from './availability'
import { emitWebMCPKitEvent } from './events'
import { requestToolConfirmation } from './confirmation'
import type {
  ConfirmationEventDetail,
  ToolContext,
  ToolInvocationErrorCode,
  ToolInvocationResult,
  WebMCPTool
} from './interfaces/tool'
import { formatJsonValueValidationError, validateJsonValue } from './schema'
import { ToolExecutionError } from './tool-execution-error'

export interface ToolInvocationPipelineOptions {
  invocationId?: string
  isCurrent?: () => boolean
  input: unknown
  signal?: AbortSignal
  source: ToolContext['source']
  startedAt?: number
}

export function createInvocationId(): string {
  return `invocation_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export async function invokeToolPipeline<TInput, TOutput>(
  tool: WebMCPTool<TInput, TOutput>,
  options: ToolInvocationPipelineOptions
): Promise<ToolInvocationResult<TOutput>> {
  const id = options.invocationId ?? createInvocationId()
  // Copy before any subscriber runs, so neither listeners nor the caller can change the invocation.
  const input = copyJsonInput(options.input)
  emitWebMCPKitEvent({
    type: 'invoked',
    toolName: tool.name,
    timestamp: Date.now(),
    detail: {
      id,
      toolName: tool.name,
      input: input.valid ? structuredClone(input.value) : undefined,
      source: options.source
    }
  })
  const result = await executePipeline(tool, options, id, input)
  emitWebMCPKitEvent({
    type:
      result.status === 'success'
        ? 'succeeded'
        : result.status === 'blocked' || result.status === 'unavailable'
          ? 'blocked'
          : 'failed',
    toolName: tool.name,
    timestamp: Date.now(),
    detail: copyResultForEvent(result)
  })
  return result
}

// Listeners get a deep copy, so redacting or changing it cannot change the caller's validated result.
// Output that cannot be cloned, such as FormData, is left out of the event.
function copyResultForEvent<TOutput>(result: ToolInvocationResult<TOutput>) {
  const { output, details, ...fields } = result
  const rest = { ...fields, ...(details ? { details: structuredClone(details) } : {}) }
  if (output === undefined) return { ...rest }
  try {
    return { ...rest, output: structuredClone(output) }
  } catch {
    return { ...rest }
  }
}

async function executePipeline<TInput, TOutput>(
  tool: WebMCPTool<TInput, TOutput>,
  options: ToolInvocationPipelineOptions,
  id: string,
  copied: JsonInputCopy
): Promise<ToolInvocationResult<TOutput>> {
  const startedAt = options.startedAt ?? performance.now()
  if (!copied.valid) {
    return createInvocationResult<TOutput>(
      tool.name,
      'error',
      startedAt,
      undefined,
      'Tool input must be JSON data: plain objects, arrays, strings, finite numbers, booleans, or null.',
      'invalid_input',
      id
    )
  }
  let input: unknown = copied.value
  const inputValidationErrors = validateJsonValue(input, tool.inputSchema)
  if (inputValidationErrors.length > 0) {
    return createInvocationResult<TOutput>(
      tool.name,
      'error',
      startedAt,
      undefined,
      formatJsonValueValidationError(inputValidationErrors),
      'invalid_input',
      id
    )
  }

  const schema = JSON.stringify(tool.inputSchema)

  // Rechecks run after each asynchronous boundary; the first check runs before any await.
  function checkAvailability(id: string): ToolInvocationResult<TOutput> | undefined {
    if (options.signal?.aborted) {
      return createInvocationResult<TOutput>(
        tool.name,
        'error',
        startedAt,
        undefined,
        'Tool invocation was cancelled.',
        'cancelled',
        id
      )
    }
    if (options.isCurrent?.() === false || JSON.stringify(tool.inputSchema) !== schema) {
      return createInvocationResult<TOutput>(
        tool.name,
        'unavailable',
        startedAt,
        undefined,
        'The tool changed. Start a new request.',
        'tool_changed',
        id
      )
    }
    const availability = getToolAvailability(tool)
    if (!availability.available) {
      return createInvocationResult<TOutput>(
        tool.name,
        availability.failed ? 'error' : 'unavailable',
        startedAt,
        undefined,
        availability.reason ?? 'Tool is not available in the current state.',
        availability.failed ? 'scope_failed' : 'scope_unavailable',
        id
      )
    }
  }

  const initialFailure = checkAvailability(id)
  if (initialFailure) return initialFailure

  if (tool.parseInput) {
    try {
      input = await waitForInvocation(Promise.resolve(tool.parseInput(input)), options.signal)
    } catch (error) {
      if (options.signal?.aborted) return checkAvailability(id)!
      return createInvocationResult<TOutput>(
        tool.name,
        'error',
        startedAt,
        undefined,
        error instanceof Error ? error.message : 'Tool input parsing failed.',
        'invalid_input',
        id
      )
    }
    const parsingFailure = checkAvailability(id)
    if (parsingFailure) return parsingFailure
  }

  if (tool.confirmation) {
    const confirmation: ConfirmationEventDetail = {
      id,
      toolName: tool.name,
      source: options.source
    }
    emitWebMCPKitEvent({
      type: 'confirmation-requested',
      toolName: tool.name,
      timestamp: Date.now(),
      detail: confirmation
    })
    let approved = false
    try {
      approved = await waitForInvocation(
        requestToolConfirmation(tool, copyForObserver(input), options.signal),
        options.signal
      )
    } catch (error) {
      if (options.signal?.aborted) return checkAvailability(id)!
      return createInvocationResult<TOutput>(
        tool.name,
        'error',
        startedAt,
        undefined,
        error instanceof Error ? error.message : 'Confirmation handler failed.',
        'confirmation_failed',
        id
      )
    } finally {
      emitWebMCPKitEvent({
        type: 'confirmation-settled',
        toolName: tool.name,
        timestamp: Date.now(),
        detail: { ...confirmation, approved }
      })
    }

    const approvalFailure = checkAvailability(id)
    if (approvalFailure) return approvalFailure

    if (!approved) {
      return createInvocationResult<TOutput>(
        tool.name,
        'blocked',
        startedAt,
        undefined,
        tool.confirmation.reason,
        'confirmation_denied',
        id
      )
    }
  }

  const typedInput = input as TInput
  if (tool.guard) {
    try {
      const guardResult = await waitForInvocation(
        Promise.resolve(tool.guard(copyForObserver(typedInput) as TInput)),
        options.signal
      )
      if (guardResult !== true) {
        return createInvocationResult<TOutput>(
          tool.name,
          'blocked',
          startedAt,
          undefined,
          typeof guardResult === 'string' ? guardResult : 'Tool guard blocked invocation.',
          'guard_blocked',
          id
        )
      }
    } catch (error) {
      if (options.signal?.aborted) return checkAvailability(id)!
      return createInvocationResult<TOutput>(
        tool.name,
        'error',
        startedAt,
        undefined,
        error instanceof Error ? error.message : 'Tool guard failed.',
        'guard_failed',
        id
      )
    }

    const executionFailure = checkAvailability(id)
    if (executionFailure) return executionFailure
  }

  let output: TOutput
  try {
    output = await tool.execute(typedInput, {
      source: options.source,
      ...(options.signal ? { signal: options.signal } : {})
    })
  } catch (error) {
    const result = createInvocationResult<TOutput>(
      tool.name,
      'error',
      startedAt,
      undefined,
      error instanceof Error ? error.message : 'Tool invocation failed.',
      error instanceof ToolExecutionError ? error.code : 'execution_failed',
      id
    )
    if (error instanceof ToolExecutionError && error.details) {
      const details = copyJsonInput(error.details)
      if (details.valid) result.details = details.value as Record<string, unknown>
    }
    return result
  }
  if (tool.outputSchema) {
    let outputValidationErrors: string[]
    try {
      outputValidationErrors = validateJsonValue(output, tool.outputSchema)
    } catch {
      outputValidationErrors = ['Tool output must be JSON data.']
    }
    if (outputValidationErrors.length > 0) {
      return createInvocationResult<TOutput>(
        tool.name,
        'error',
        startedAt,
        undefined,
        formatJsonValueValidationError(outputValidationErrors, 'output'),
        'invalid_output',
        id
      )
    }
  }
  return createInvocationResult<TOutput>(
    tool.name,
    'success',
    startedAt,
    output,
    undefined,
    undefined,
    id
  )
}

type JsonInputCopy = { valid: true; value: unknown } | { valid: false }

/**
 * Approval handlers and guards get a copy so they cannot change what executes.
 * A parser output keeps its original reference when cloning would lose its
 * prototype (class instances, null-prototype objects) or fails outright.
 */
function copyForObserver(value: unknown): unknown {
  try {
    const copy = structuredClone(value)
    return preservesCloneSemantics(value, copy, new WeakSet()) ? copy : value
  } catch {
    return value
  }
}

function preservesCloneSemantics(
  original: unknown,
  copy: unknown,
  visited: WeakSet<object>
): boolean {
  if (original === null || typeof original !== 'object') return Object.is(original, copy)
  if (copy === null || typeof copy !== 'object') return false
  if (visited.has(original)) return true
  visited.add(original)
  if (Object.getPrototypeOf(original) !== Object.getPrototypeOf(copy)) return false
  if (original instanceof Map) return sameMapContents(original, copy, visited)
  if (original instanceof Set) return sameSetContents(original, copy, visited)
  if (original instanceof Date)
    return copy instanceof Date && Object.is(original.getTime(), copy.getTime())
  if (original instanceof RegExp)
    return (
      copy instanceof RegExp && original.source === copy.source && original.flags === copy.flags
    )
  if (Array.isArray(original) && (!Array.isArray(copy) || original.length !== copy.length))
    return false
  return sameOwnProperties(original, copy, visited)
}

function sameMapContents(
  original: Map<unknown, unknown>,
  copy: unknown,
  visited: WeakSet<object>
): boolean {
  if (!(copy instanceof Map) || original.size !== copy.size) return false
  const copyEntries = copy.entries()
  for (const [key, value] of original) {
    const entry = copyEntries.next()
    if (entry.done) return false
    if (!preservesCloneSemantics(key, entry.value[0], visited)) return false
    if (!preservesCloneSemantics(value, entry.value[1], visited)) return false
  }
  return true
}

function sameSetContents(original: Set<unknown>, copy: unknown, visited: WeakSet<object>): boolean {
  if (!(copy instanceof Set) || original.size !== copy.size) return false
  const copyValues = copy.values()
  for (const value of original) {
    const entry = copyValues.next()
    if (entry.done) return false
    if (!preservesCloneSemantics(value, entry.value, visited)) return false
  }
  return true
}

function sameOwnProperties(original: object, copy: object, visited: WeakSet<object>): boolean {
  const keys = Object.keys(original)
  if (keys.length !== Object.keys(copy).length) return false
  for (const key of keys) {
    if (!Object.hasOwn(copy, key)) return false
    const originalValue = (original as Record<string, unknown>)[key]
    const copyValue = (copy as Record<string, unknown>)[key]
    if (!preservesCloneSemantics(originalValue, copyValue, visited)) return false
  }
  return true
}

/** Deep-copies plain JSON data and rejects everything else (BigInt, cycles, Map, Date, class instances). */
function copyJsonInput(value: unknown): JsonInputCopy {
  const ancestors = new Set<object>()
  function copy(current: unknown): unknown {
    if (current === null || typeof current === 'string' || typeof current === 'boolean')
      return current
    if (typeof current === 'number') {
      if (Number.isFinite(current)) return current
      throw new TypeError('non-finite number')
    }
    if (typeof current !== 'object') throw new TypeError('unsupported value')
    if (ancestors.has(current)) throw new TypeError('cycle')
    ancestors.add(current)
    try {
      if (Array.isArray(current)) return current.map(copy)
      const prototype = Object.getPrototypeOf(current)
      if (prototype !== Object.prototype && prototype !== null)
        throw new TypeError('not a plain object')
      const result: Record<string, unknown> = {}
      for (const [key, entry] of Object.entries(current)) {
        // Define, never assign: an untrusted "__proto__" key must stay an own, validated property.
        if (entry !== undefined)
          Object.defineProperty(result, key, {
            value: copy(entry),
            enumerable: true,
            writable: true,
            configurable: true
          })
      }
      return result
    } finally {
      ancestors.delete(current)
    }
  }
  if (value === undefined) return { valid: true, value }
  try {
    return { valid: true, value: copy(value) }
  } catch {
    return { valid: false }
  }
}

export function createInvocationResult<TOutput>(
  toolName: string,
  status: ToolInvocationResult['status'],
  startedAt: number,
  output?: TOutput,
  error?: string,
  code?: ToolInvocationErrorCode,
  invocationId?: string
): ToolInvocationResult<TOutput> {
  return {
    toolName,
    status,
    code,
    output,
    error,
    durationMs: Math.round(performance.now() - startedAt),
    ...(invocationId === undefined ? {} : { invocationId })
  }
}

function waitForInvocation<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending
  return new Promise(function wait(resolve, reject) {
    function abort() {
      reject(new Error('Tool invocation was cancelled.'))
    }
    signal.addEventListener('abort', abort, { once: true })
    pending.then(resolve, reject).finally(function cleanup() {
      signal.removeEventListener('abort', abort)
    })
    if (signal.aborted) abort()
  })
}
