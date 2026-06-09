import type { ToolInvocationResult, ToolPlan, ToolPlanStep } from './interfaces/tool'
import type { WebMCPCommandStepEventDetail } from './interfaces/command-input'
import { isPlannerOutcomeToolName } from './plan-validation'
import { invokeTool } from './registry'

export async function invokePlannedSteps(
  plan: ToolPlan,
  setActiveToolName: (toolName: string) => void,
  dispatchStepEvent: (detail: Omit<WebMCPCommandStepEventDetail, 'message'>) => void,
  signal?: AbortSignal
): Promise<ToolInvocationResult> {
  if (isPlannerOutcomeToolName(plan.toolName)) {
    return {
      toolName: plan.toolName,
      status: plan.toolName === 'needs_clarification' ? 'blocked' : 'unavailable',
      error: plan.reason,
      durationMs: 0
    }
  }

  const steps = getPlanSteps(plan)
  let result: ToolInvocationResult | undefined

  for (const [index, step] of steps.entries()) {
    throwIfAborted(signal)
    const toolName =
      steps.length > 1 ? `${step.toolName} (${index + 1}/${steps.length})` : step.toolName
    setActiveToolName(toolName)
    dispatchStepEvent({
      phase: 'started',
      plan,
      step,
      stepCount: steps.length,
      stepIndex: index
    })
    result = await invokeTool({
      toolName: step.toolName,
      input: step.input,
      source: 'planner'
    })
    dispatchStepEvent({
      phase: 'completed',
      plan,
      result,
      step,
      stepCount: steps.length,
      stepIndex: index
    })
    if (result.status !== 'success') return result
  }

  return (
    result ?? {
      toolName: plan.toolName,
      status: 'error',
      error: 'Planner returned no executable steps.',
      durationMs: 0
    }
  )
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return
  throw new Error('Command was cancelled.')
}

function getPlanSteps(plan: ToolPlan): ToolPlanStep[] {
  if (Array.isArray(plan.steps)) return plan.steps

  return [
    {
      toolName: plan.toolName,
      input: plan.input,
      confidence: plan.confidence,
      reason: plan.reason
    }
  ]
}
