import type { ToolInvocationResult, ToolResolution, ToolResolutionStep } from './interfaces/tool'
import type { WebMCPCommandStepEventDetail } from './interfaces/command-input'
import { isResolverOutcomeToolName } from './resolution-validation'
import { invokeTool } from './registry'
import { raceAbort } from './abort'

export async function invokeResolvedSteps(
  resolution: ToolResolution,
  setActiveToolName: (toolName: string) => void,
  dispatchStepEvent: (detail: Omit<WebMCPCommandStepEventDetail, 'message'>) => void,
  signal?: AbortSignal
): Promise<ToolInvocationResult> {
  if (isResolverOutcomeToolName(resolution.toolName)) {
    return {
      toolName: resolution.toolName,
      status: resolution.toolName === 'needs_clarification' ? 'blocked' : 'unavailable',
      error: resolution.reason,
      durationMs: 0
    }
  }

  const steps = getResolutionSteps(resolution)
  let result: ToolInvocationResult | undefined

  for (const [index, step] of steps.entries()) {
    throwIfAborted(signal)
    const toolName =
      steps.length > 1 ? `${step.toolName} (${index + 1}/${steps.length})` : step.toolName
    setActiveToolName(toolName)
    dispatchStepEvent({
      phase: 'started',
      resolution,
      step,
      stepCount: steps.length,
      stepIndex: index
    })
    result = await invokeTool({
      toolName: step.toolName,
      input: step.input,
      signal,
      source: 'resolver'
    })
    dispatchStepEvent({
      phase: 'completed',
      resolution,
      result,
      step,
      stepCount: steps.length,
      stepIndex: index
    })
    if (result.status !== 'success') return result
  }

  return (
    result ?? {
      toolName: resolution.toolName,
      status: 'error',
      error: 'Resolver returned no executable steps.',
      durationMs: 0
    }
  )
}

export const commandCancelledMessage = 'Command was cancelled.'

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return
  throw new Error(commandCancelledMessage)
}

/** Stops waiting when the command is cancelled, even if the awaited work ignores the signal. */
export function waitUnlessAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return raceAbort(promise, signal, commandCancelledMessage)
}

function getResolutionSteps(resolution: ToolResolution): ToolResolutionStep[] {
  if (Array.isArray(resolution.steps)) return resolution.steps

  return [
    {
      toolName: resolution.toolName,
      input: resolution.input,
      confidence: resolution.confidence,
      reason: resolution.reason
    }
  ]
}
