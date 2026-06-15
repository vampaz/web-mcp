import { requestToolConfirmation } from './confirmation'
import type { ToolContext, ToolInvocationResult, WebMCPTool } from './interfaces/tool'
import { formatJsonValueValidationError, validateJsonValue } from './schema'

export interface ToolInvocationPipelineOptions {
  confirmed?: boolean
  input: unknown
  source: ToolContext['source']
  startedAt?: number
}

export async function invokeToolPipeline<TInput, TOutput>(
  tool: WebMCPTool<TInput, TOutput>,
  options: ToolInvocationPipelineOptions
): Promise<ToolInvocationResult<TOutput>> {
  const startedAt = options.startedAt ?? performance.now()
  const inputValidationErrors = validateJsonValue(options.input, tool.inputSchema)
  if (inputValidationErrors.length > 0) {
    return createInvocationResult<TOutput>(
      tool.name,
      'error',
      startedAt,
      undefined,
      formatJsonValueValidationError(inputValidationErrors)
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
        availability.reason ?? 'Tool is not available in the current state.'
      )
    }
  } catch (error) {
    return createInvocationResult<TOutput>(
      tool.name,
      'error',
      startedAt,
      undefined,
      error instanceof Error ? error.message : 'Tool scope failed.'
    )
  }

  let confirmed = options.confirmed === true || !tool.confirmation?.required
  if (!confirmed) {
    try {
      confirmed = await requestToolConfirmation(tool, options.input)
    } catch (error) {
      return createInvocationResult<TOutput>(
        tool.name,
        'error',
        startedAt,
        undefined,
        error instanceof Error ? error.message : 'Confirmation handler failed.'
      )
    }
  }

  if (tool.confirmation?.required && !confirmed) {
    return createInvocationResult<TOutput>(
      tool.name,
      'blocked',
      startedAt,
      undefined,
      tool.confirmation.reason
    )
  }

  const typedInput = options.input as TInput
  try {
    const guardResult = await tool.guard?.(typedInput)
    if (typeof guardResult === 'string' || guardResult === false) {
      return createInvocationResult<TOutput>(
        tool.name,
        'blocked',
        startedAt,
        undefined,
        typeof guardResult === 'string' ? guardResult : 'Tool guard blocked invocation.'
      )
    }
  } catch (error) {
    return createInvocationResult<TOutput>(
      tool.name,
      'error',
      startedAt,
      undefined,
      error instanceof Error ? error.message : 'Tool guard failed.'
    )
  }

  try {
    const output = await tool.execute(typedInput, {
      source: options.source
    })
    return createInvocationResult<TOutput>(tool.name, 'success', startedAt, output)
  } catch (error) {
    return createInvocationResult<TOutput>(
      tool.name,
      'error',
      startedAt,
      undefined,
      error instanceof Error ? error.message : 'Tool invocation failed.'
    )
  }
}

export function createInvocationResult<TOutput>(
  toolName: string,
  status: ToolInvocationResult['status'],
  startedAt: number,
  output?: TOutput,
  error?: string
): ToolInvocationResult<TOutput> {
  return {
    toolName,
    status,
    output,
    error,
    durationMs: Math.round(performance.now() - startedAt)
  }
}
