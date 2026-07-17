import type { PlannerContext, ToolPlan } from '@vampaz/webmcp-kit'

export type WebMCPPlannerOutcome = 'needs_clarification' | 'no_tools_match'

export interface WebMCPPlannerEvalStepExpectation {
  toolName: string
  inputSubset?: Record<string, unknown>
}

export interface WebMCPPlannerEvalCaseBase {
  name: string
  message: string
  context?: PlannerContext
  expectedInput?: Record<string, unknown>
  expectedInputSubset?: Record<string, unknown>
  expectedSteps?: WebMCPPlannerEvalStepExpectation[]
}

export type WebMCPPlannerEvalCase = WebMCPPlannerEvalCaseBase &
  (
    | {
        expectedToolName: string
        expectedOutcome?: never
      }
    | {
        expectedToolName?: never
        expectedOutcome: WebMCPPlannerOutcome
      }
  )

export interface WebMCPPlannerEvalResult {
  name: string
  passed: boolean
  message: string
  durationMs: number
  plan?: ToolPlan
  errors: string[]
}

export interface WebMCPPlannerEvalSuiteOptions {
  minimumPassRate?: number
  runsPerCase?: number
}

export interface WebMCPPlannerEvalCaseSummary {
  name: string
  runs: number
  passes: number
  passRate: number
  passed: boolean
  averageDurationMs: number
  results: WebMCPPlannerEvalResult[]
}

export interface WebMCPPlannerEvalSuiteResult {
  plannerName: string
  passed: boolean
  minimumPassRate: number
  runsPerCase: number
  caseResults: WebMCPPlannerEvalCaseSummary[]
}
