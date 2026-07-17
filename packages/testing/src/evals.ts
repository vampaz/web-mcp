import {
  validateToolPlan,
  type AnyWebMCPTool,
  type ToolPlan,
  type ToolPlanner,
  type WebMCPTool
} from '@vampaz/webmcp-kit'

import type {
  WebMCPPlannerEvalCase,
  WebMCPPlannerEvalCaseSummary,
  WebMCPPlannerEvalResult,
  WebMCPPlannerEvalSuiteOptions,
  WebMCPPlannerEvalSuiteResult
} from './interfaces/evals'

export type {
  WebMCPPlannerEvalCase,
  WebMCPPlannerEvalCaseBase,
  WebMCPPlannerEvalCaseSummary,
  WebMCPPlannerEvalResult,
  WebMCPPlannerEvalStepExpectation,
  WebMCPPlannerEvalSuiteOptions,
  WebMCPPlannerEvalSuiteResult,
  WebMCPPlannerOutcome
} from './interfaces/evals'

export async function runWebMCPPlannerEvalCase(
  planner: ToolPlanner,
  tools: readonly AnyWebMCPTool[],
  testCase: WebMCPPlannerEvalCase
): Promise<WebMCPPlannerEvalResult> {
  const errors: string[] = []
  const plannerTools = tools as unknown as WebMCPTool[]
  const startedAt = performance.now()
  const expectationError = getExpectationError(testCase)
  if (expectationError) {
    return {
      name: testCase.name,
      passed: false,
      message: testCase.message,
      durationMs: Math.round(performance.now() - startedAt),
      errors: [expectationError]
    }
  }

  try {
    const plan = await planner.plan(testCase.message, plannerTools, testCase.context ?? {})
    collectPlanErrors(plan, plannerTools, testCase, errors)

    return {
      name: testCase.name,
      passed: errors.length === 0,
      message: testCase.message,
      durationMs: Math.round(performance.now() - startedAt),
      plan,
      errors
    }
  } catch (error) {
    return {
      name: testCase.name,
      passed: false,
      message: testCase.message,
      durationMs: Math.round(performance.now() - startedAt),
      errors: [error instanceof Error ? error.message : String(error)]
    }
  }
}

export async function runWebMCPPlannerEvalSuite(
  planner: ToolPlanner,
  tools: readonly AnyWebMCPTool[],
  testCases: readonly WebMCPPlannerEvalCase[],
  options: WebMCPPlannerEvalSuiteOptions = {}
): Promise<WebMCPPlannerEvalSuiteResult> {
  const runsPerCase = options.runsPerCase ?? 1
  const minimumPassRate = options.minimumPassRate ?? 1
  assertValidSuiteOptions(testCases, runsPerCase, minimumPassRate)
  const caseResults: WebMCPPlannerEvalCaseSummary[] = []

  for (const testCase of testCases) {
    const results: WebMCPPlannerEvalResult[] = []
    for (let run = 0; run < runsPerCase; run += 1) {
      results.push(await runWebMCPPlannerEvalCase(planner, tools, testCase))
    }

    const passes = results.filter(function evalPassed(result) {
      return result.passed
    }).length
    const passRate = passes / runsPerCase
    caseResults.push({
      name: testCase.name,
      runs: runsPerCase,
      passes,
      passRate,
      passed: passRate >= minimumPassRate,
      averageDurationMs:
        results.reduce(function addDuration(total, result) {
          return total + result.durationMs
        }, 0) / runsPerCase,
      results
    })
  }

  return {
    plannerName: planner.name,
    passed: caseResults.every(function casePassed(result) {
      return result.passed
    }),
    minimumPassRate,
    runsPerCase,
    caseResults
  }
}

export async function runWebMCPPlannerEvals(
  planner: ToolPlanner,
  tools: readonly AnyWebMCPTool[],
  testCases: readonly WebMCPPlannerEvalCase[]
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

  const expectedToolName = testCase.expectedToolName ?? testCase.expectedOutcome
  if (plan.toolName !== expectedToolName) {
    errors.push(`Expected toolName "${expectedToolName}" but planner returned "${plan.toolName}".`)
  }

  if (
    testCase.expectedInput !== undefined &&
    stringifyStable(plan.input) !== stringifyStable(testCase.expectedInput)
  ) {
    errors.push(
      `Expected input ${stringifyStable(testCase.expectedInput)} but planner returned ${stringifyStable(plan.input)}.`
    )
  }

  if (
    testCase.expectedInputSubset !== undefined &&
    !isJsonSubset(plan.input, testCase.expectedInputSubset)
  ) {
    errors.push(
      `Expected input to include ${stringifyStable(testCase.expectedInputSubset)} but planner returned ${stringifyStable(plan.input)}.`
    )
  }

  collectStepErrors(plan, testCase, errors)
}

function collectStepErrors(
  plan: ToolPlan,
  testCase: WebMCPPlannerEvalCase,
  errors: string[]
): void {
  if (!testCase.expectedSteps) return
  const steps = plan.steps ?? []
  if (steps.length !== testCase.expectedSteps.length) {
    errors.push(
      `Expected ${testCase.expectedSteps.length} steps but planner returned ${steps.length}.`
    )
    return
  }

  testCase.expectedSteps.forEach(function checkExpectedStep(expectedStep, index) {
    const step = steps[index]
    if (!step) return
    if (step.toolName !== expectedStep.toolName) {
      errors.push(
        `Expected step ${index + 1} toolName "${expectedStep.toolName}" but planner returned "${step.toolName}".`
      )
    }
    if (expectedStep.inputSubset && !isJsonSubset(step.input, expectedStep.inputSubset)) {
      errors.push(
        `Expected step ${index + 1} input to include ${stringifyStable(expectedStep.inputSubset)} but planner returned ${stringifyStable(step.input)}.`
      )
    }
  })
}

function isJsonSubset(value: unknown, subset: unknown): boolean {
  if (Array.isArray(subset)) {
    return Array.isArray(value) && stringifyStable(value) === stringifyStable(subset)
  }
  if (!subset || typeof subset !== 'object') return Object.is(value, subset)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false

  return Object.entries(subset).every(function entryMatches([key, entryValue]) {
    return isJsonSubset((value as Record<string, unknown>)[key], entryValue)
  })
}

function getExpectationError(testCase: WebMCPPlannerEvalCase): string | undefined {
  const expectedToolDefined = testCase.expectedToolName !== undefined
  const expectedOutcomeDefined = testCase.expectedOutcome !== undefined
  if (expectedToolDefined === expectedOutcomeDefined) {
    return 'Eval case must define exactly one of expectedToolName or expectedOutcome.'
  }

  return undefined
}

function assertValidSuiteOptions(
  testCases: readonly WebMCPPlannerEvalCase[],
  runsPerCase: number,
  minimumPassRate: number
): void {
  if (testCases.length === 0) {
    throw new Error('testCases must contain at least one eval case.')
  }
  if (!Number.isInteger(runsPerCase) || runsPerCase < 1) {
    throw new Error('runsPerCase must be a positive integer.')
  }
  if (!Number.isFinite(minimumPassRate) || minimumPassRate < 0 || minimumPassRate > 1) {
    throw new Error('minimumPassRate must be between 0 and 1.')
  }
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
