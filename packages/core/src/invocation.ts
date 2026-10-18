import { requestToolConfirmation } from './confirmation'
import type {
  ToolContext,
  ToolInvocationErrorCode,
  ToolInvocationResult,
  WebMCPTool
} from './interfaces/tool'
import { formatJsonValueValidationError, validateJsonValue } from './schema'

export interface ToolInvocationPipelineOptions {
  confirmed?: boolean
  isCurrent?: () => boolean
  input: unknown
  signal?: AbortSignal
  source: ToolContext['source']
  startedAt?: number
}

export async function invokeToolPipeline<TInput, TOutput>(
  tool: WebMCPTool<TInput, TOutput>,
  options: ToolInvocationPipelineOptions
): Promise<ToolInvocationResult<TOutput>> {
  const startedAt = options.startedAt ?? performance.now()
  let input: unknown
  try {
    input = structuredClone(options.input)
  } catch {
    return createInvocationResult<TOutput>(
      tool.name,
      'error',
      startedAt,
      undefined,
      'Tool input must be serializable data.',
      'invalid_input'
    )
  }
  const inputValidationErrors = validateJsonValue(input, tool.inputSchema)
  if (inputValidationErrors.length > 0) {
    return createInvocationResult<TOutput>(
      tool.name,
      'error',
      startedAt,
      undefined,
      formatJsonValueValidationError(inputValidationErrors),
      'invalid_input'
    )
  }

  const schema = JSON.stringify(tool.inputSchema)

  function checkAvailability(): ToolInvocationResult<TOutput> | undefined {
    if (options.signal?.aborted) {
      return createInvocationResult<TOutput>(
        tool.name,
        'error',
        startedAt,
        undefined,
        'Tool invocation was cancelled.',
        'cancelled'
      )
    }
    if (options.isCurrent?.() === false || JSON.stringify(tool.inputSchema) !== schema) {
      return createInvocationResult<TOutput>(
        tool.name,
        'unavailable',
        startedAt,
        undefined,
        'The tool changed. Start a new request.',
        'tool_changed'
      )
    }
    try {
      const availability = tool.scope?.()
      if (availability && !availability.available) {
        return createInvocationResult<TOutput>(
          tool.name,
          'unavailable',
          startedAt,
          undefined,
          availability.reason ?? 'Tool is not available in the current state.',
          'scope_unavailable'
        )
      }
    } catch (error) {
      return createInvocationResult<TOutput>(
        tool.name,
        'error',
        startedAt,
        undefined,
        error instanceof Error ? error.message : 'Tool scope failed.',
        'scope_failed'
      )
    }
  }

  const initialFailure = checkAvailability()
  if (initialFailure) return initialFailure

  let confirmed = options.confirmed === true || !tool.confirmation?.required
  if (!confirmed) {
    try {
      confirmed = await waitForInvocation(
        requestToolConfirmation(tool, input, options.signal),
        options.signal
      )
    } catch (error) {
      if (options.signal?.aborted) return checkAvailability()!
      return createInvocationResult<TOutput>(
        tool.name,
        'error',
        startedAt,
        undefined,
        error instanceof Error ? error.message : 'Confirmation handler failed.',
        'confirmation_failed'
      )
    }
  }

  const approvalFailure = checkAvailability()
  if (approvalFailure) return approvalFailure

  if (tool.confirmation?.required && !confirmed) {
    return createInvocationResult<TOutput>(
      tool.name,
      'blocked',
      startedAt,
      undefined,
      tool.confirmation.reason,
      'confirmation_denied'
    )
  }

  const typedInput = input as TInput
  try {
    const guardResult = await waitForInvocation(
      Promise.resolve(tool.guard?.(typedInput)),
      options.signal
    )
    if (typeof guardResult === 'string' || guardResult === false) {
      return createInvocationResult<TOutput>(
        tool.name,
        'blocked',
        startedAt,
        undefined,
        typeof guardResult === 'string' ? guardResult : 'Tool guard blocked invocation.',
        'guard_blocked'
      )
    }
  } catch (error) {
    if (options.signal?.aborted) return checkAvailability()!
    return createInvocationResult<TOutput>(
      tool.name,
      'error',
      startedAt,
      undefined,
      error instanceof Error ? error.message : 'Tool guard failed.',
      'guard_failed'
    )
  }

  const executionFailure = checkAvailability()
  if (executionFailure) return executionFailure

  try {
    const output = await tool.execute(typedInput, {
      source: options.source,
      ...(options.signal ? { signal: options.signal } : {})
    })
    if (tool.outputSchema) {
      const outputValidationErrors = validateJsonValue(output, tool.outputSchema)
      if (outputValidationErrors.length > 0) {
        return createInvocationResult<TOutput>(
          tool.name,
          'error',
          startedAt,
          undefined,
          formatJsonValueValidationError(outputValidationErrors, 'output'),
          'invalid_output'
        )
      }
    }
    return createInvocationResult<TOutput>(tool.name, 'success', startedAt, output)
  } catch (error) {
    return createInvocationResult<TOutput>(
      tool.name,
      'error',
      startedAt,
      undefined,
      error instanceof Error ? error.message : 'Tool invocation failed.',
      'execution_failed'
    )
  }
}

export function createInvocationResult<TOutput>(
  toolName: string,
  status: ToolInvocationResult['status'],
  startedAt: number,
  output?: TOutput,
  error?: string,
  code?: ToolInvocationErrorCode
): ToolInvocationResult<TOutput> {
  return {
    toolName,
    status,
    code,
    output,
    error,
    durationMs: Math.round(performance.now() - startedAt)
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
