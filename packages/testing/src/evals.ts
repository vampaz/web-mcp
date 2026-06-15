import {
  validateToolPlan,
  type PlannerContext,
  type ToolPlan,
  type ToolPlanner,
  type WebMCPTool
} from '@vampaz/webmcp-kit'

export interface WebMCPPlannerEvalCase {
  name: string
  message: string
  context?: PlannerContext
  expectedToolName: string
  expectedInput?: Record<string, unknown>
}

export interface WebMCPPlannerEvalResult {
  name: string
  passed: boolean
  message: string
  plan?: ToolPlan
  errors: string[]
}

export async function runWebMCPPlannerEvalCase(
  planner: ToolPlanner,
  tools: WebMCPTool[],
  testCase: WebMCPPlannerEvalCase
): Promise<WebMCPPlannerEvalResult> {
  const errors: string[] = []

  try {
    const plan = await planner.plan(testCase.message, tools, testCase.context ?? {})
    collectPlanErrors(plan, tools, testCase, errors)

    return {
      name: testCase.name,
      passed: errors.length === 0,
      message: testCase.message,
      plan,
      errors
    }
  } catch (error) {
    return {
      name: testCase.name,
      passed: false,
      message: testCase.message,
      errors: [error instanceof Error ? error.message : String(error)]
    }
  }
}

export async function runWebMCPPlannerEvals(
  planner: ToolPlanner,
  tools: WebMCPTool[],
  testCases: WebMCPPlannerEvalCase[]
): Promise<WebMCPPlannerEvalResult[]> {
  const results: WebMCPPlannerEvalResult[] = []

  for (const testCase of testCases) {
    results.push(await runWebMCPPlannerEvalCase(planner, tools, testCase))
  }

  return results
}

function collectPlanErrors(
  plan: ToolPlan,
  tools: WebMCPTool[],
  testCase: WebMCPPlannerEvalCase,
  errors: string[]
): void {
  try {
    validateToolPlan(plan, tools)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }

  if (plan.toolName !== testCase.expectedToolName) {
    errors.push(
      `Expected toolName "${testCase.expectedToolName}" but planner returned "${plan.toolName}".`
    )
  }

  if (testCase.expectedInput === undefined) return
  if (stringifyStable(plan.input) === stringifyStable(testCase.expectedInput)) return

  errors.push(
    `Expected input ${stringifyStable(testCase.expectedInput)} but planner returned ${stringifyStable(plan.input)}.`
  )
}

function stringifyStable(value: unknown): string {
  return JSON.stringify(sortJsonValue(value))
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(function sortArrayItem(item) {
      return sortJsonValue(item)
    })
  }

  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value)
      .sort(function sortByKey(left, right) {
        return left[0].localeCompare(right[0])
      })
      .map(function sortEntry([key, entryValue]) {
        return [key, sortJsonValue(entryValue)]
      })
  )
}
