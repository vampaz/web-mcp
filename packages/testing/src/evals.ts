import {
  validateToolResolution,
  type AnyWebMCPTool,
  type ToolResolution,
  type ToolResolver,
  type WebMCPTool
} from '@vampaz/webmcp-kit'

import type {
  WebMCPResolverEvalCase,
  WebMCPResolverEvalCaseSummary,
  WebMCPResolverEvalResult,
  WebMCPResolverEvalSuiteOptions,
  WebMCPResolverEvalSuiteResult
} from './interfaces/evals'

export type {
  WebMCPResolverEvalCase,
  WebMCPResolverEvalCaseBase,
  WebMCPResolverEvalCaseSummary,
  WebMCPResolverEvalResult,
  WebMCPResolverEvalStepExpectation,
  WebMCPResolverEvalSuiteOptions,
  WebMCPResolverEvalSuiteResult,
  WebMCPResolverOutcome
} from './interfaces/evals'

export async function runWebMCPResolverEvalCase(
  resolver: ToolResolver,
  tools: readonly AnyWebMCPTool[],
  testCase: WebMCPResolverEvalCase
): Promise<WebMCPResolverEvalResult> {
  const errors: string[] = []
  const resolverTools = tools as unknown as WebMCPTool[]
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
    const resolution = await resolver.resolve(
      testCase.message,
      resolverTools,
      testCase.context ?? {}
    )
    collectResolutionErrors(resolution, resolverTools, testCase, errors)

    return {
      name: testCase.name,
      passed: errors.length === 0,
      message: testCase.message,
      durationMs: Math.round(performance.now() - startedAt),
      resolution,
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

export async function runWebMCPResolverEvalSuite(
  resolver: ToolResolver,
  tools: readonly AnyWebMCPTool[],
  testCases: readonly WebMCPResolverEvalCase[],
  options: WebMCPResolverEvalSuiteOptions = {}
): Promise<WebMCPResolverEvalSuiteResult> {
  const runsPerCase = options.runsPerCase ?? 1
  const minimumPassRate = options.minimumPassRate ?? 1
  assertValidSuiteOptions(testCases, runsPerCase, minimumPassRate)
  const caseResults: WebMCPResolverEvalCaseSummary[] = []

  for (const testCase of testCases) {
    const results: WebMCPResolverEvalResult[] = []
    for (let run = 0; run < runsPerCase; run += 1) {
      results.push(await runWebMCPResolverEvalCase(resolver, tools, testCase))
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
    resolverName: resolver.name,
    passed: caseResults.every(function casePassed(result) {
      return result.passed
    }),
    minimumPassRate,
    runsPerCase,
    caseResults
  }
}

export async function runWebMCPResolverEvals(
  resolver: ToolResolver,
  tools: readonly AnyWebMCPTool[],
  testCases: readonly WebMCPResolverEvalCase[]
): Promise<WebMCPResolverEvalResult[]> {
  const results: WebMCPResolverEvalResult[] = []

  for (const testCase of testCases) {
    results.push(await runWebMCPResolverEvalCase(resolver, tools, testCase))
  }

  return results
}

function collectResolutionErrors(
  resolution: ToolResolution,
  tools: WebMCPTool[],
  testCase: WebMCPResolverEvalCase,
  errors: string[]
): void {
  try {
    validateToolResolution(resolution, tools)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }

  const expectedToolName = testCase.expectedToolName ?? testCase.expectedOutcome
  if (resolution.toolName !== expectedToolName) {
    errors.push(
      `Expected toolName "${expectedToolName}" but resolver returned "${resolution.toolName}".`
    )
  }

  if (
    testCase.expectedInput !== undefined &&
    stringifyStable(resolution.input) !== stringifyStable(testCase.expectedInput)
  ) {
    errors.push(
      `Expected input ${stringifyStable(testCase.expectedInput)} but resolver returned ${stringifyStable(resolution.input)}.`
    )
  }

  if (
    testCase.expectedInputSubset !== undefined &&
    !isJsonSubset(resolution.input, testCase.expectedInputSubset)
  ) {
    errors.push(
      `Expected input to include ${stringifyStable(testCase.expectedInputSubset)} but resolver returned ${stringifyStable(resolution.input)}.`
    )
  }

  collectStepErrors(resolution, testCase, errors)
}

function collectStepErrors(
  resolution: ToolResolution,
  testCase: WebMCPResolverEvalCase,
  errors: string[]
): void {
  if (!testCase.expectedSteps) return
  const steps = resolution.steps ?? []
  if (steps.length !== testCase.expectedSteps.length) {
    errors.push(
      `Expected ${testCase.expectedSteps.length} steps but resolver returned ${steps.length}.`
    )
    return
  }

  testCase.expectedSteps.forEach(function checkExpectedStep(expectedStep, index) {
    const step = steps[index]
    if (!step) return
    if (step.toolName !== expectedStep.toolName) {
      errors.push(
        `Expected step ${index + 1} toolName "${expectedStep.toolName}" but resolver returned "${step.toolName}".`
      )
    }
    if (expectedStep.inputSubset && !isJsonSubset(step.input, expectedStep.inputSubset)) {
      errors.push(
        `Expected step ${index + 1} input to include ${stringifyStable(expectedStep.inputSubset)} but resolver returned ${stringifyStable(step.input)}.`
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

function getExpectationError(testCase: WebMCPResolverEvalCase): string | undefined {
  const expectedToolDefined = testCase.expectedToolName !== undefined
  const expectedOutcomeDefined = testCase.expectedOutcome !== undefined
  if (expectedToolDefined === expectedOutcomeDefined) {
    return 'Eval case must define exactly one of expectedToolName or expectedOutcome.'
  }

  return undefined
}

function assertValidSuiteOptions(
  testCases: readonly WebMCPResolverEvalCase[],
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
