import type { ResolverContext, ToolResolution } from '@vampaz/webmcp-kit'

export type WebMCPResolverOutcome = 'needs_clarification' | 'no_tools_match'

export interface WebMCPResolverEvalStepExpectation {
  toolName: string
  inputSubset?: Record<string, unknown>
}

export interface WebMCPResolverEvalCaseBase {
  name: string
  message: string
  context?: ResolverContext
  expectedInput?: Record<string, unknown>
  expectedInputSubset?: Record<string, unknown>
  expectedSteps?: WebMCPResolverEvalStepExpectation[]
}

export type WebMCPResolverEvalCase = WebMCPResolverEvalCaseBase &
  (
    | {
        expectedToolName: string
        expectedOutcome?: never
      }
    | {
        expectedToolName?: never
        expectedOutcome: WebMCPResolverOutcome
      }
  )

export interface WebMCPResolverEvalResult {
  name: string
  passed: boolean
  message: string
  durationMs: number
  resolution?: ToolResolution
  errors: string[]
}

export interface WebMCPResolverEvalSuiteOptions {
  minimumPassRate?: number
  runsPerCase?: number
}

export interface WebMCPResolverEvalCaseSummary {
  name: string
  runs: number
  passes: number
  passRate: number
  passed: boolean
  averageDurationMs: number
  results: WebMCPResolverEvalResult[]
}

export interface WebMCPResolverEvalSuiteResult {
  resolverName: string
  passed: boolean
  minimumPassRate: number
  runsPerCase: number
  caseResults: WebMCPResolverEvalCaseSummary[]
}
