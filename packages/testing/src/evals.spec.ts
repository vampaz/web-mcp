import { describe, expect, it, vi } from 'vitest'

import { createHeuristicPlanner, defineTool } from '@vampaz/webmcp-kit'

import { runWebMCPPlannerEvalCase, runWebMCPPlannerEvalSuite, runWebMCPPlannerEvals } from './evals'
import type { WebMCPPlannerEvalCase } from './interfaces/evals'

describe('planner eval helpers', () => {
  const tools = [
    defineTool({
      name: 'search_products',
      description: 'Search visible products by query.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' }
        },
        required: ['query'],
        additionalProperties: false
      },
      execute(input) {
        return input
      }
    })
  ]

  it('returns a passing result when the planner matches the expected tool and input', async () => {
    const planner = createHeuristicPlanner()
    const result = await runWebMCPPlannerEvalCase(planner, tools, {
      name: 'product search',
      message: 'Find docks',
      expectedToolName: 'search_products',
      expectedInput: {
        query: 'docks'
      }
    })

    expect(result).toMatchObject({
      name: 'product search',
      passed: true,
      errors: []
    })
    expect(result.plan?.toolName).toBe('search_products')
  })

  it('reports mismatches without throwing', async () => {
    const planner = createHeuristicPlanner()
    const [result] = await runWebMCPPlannerEvals(planner, tools, [
      {
        name: 'wrong expectation',
        message: 'Find docks',
        expectedToolName: 'create_invoice'
      }
    ])

    expect(result).toMatchObject({
      name: 'wrong expectation',
      passed: false
    })
    expect(result?.errors[0]).toContain('Expected toolName "create_invoice"')
  })

  it('supports planner outcomes and partial input expectations', async () => {
    const planner = createHeuristicPlanner()
    const result = await runWebMCPPlannerEvalCase(planner, tools, {
      name: 'unsupported request',
      message: 'Send the weekly report',
      expectedOutcome: 'no_tools_match'
    })

    expect(result).toMatchObject({
      passed: true,
      durationMs: expect.any(Number),
      plan: {
        toolName: 'no_tools_match'
      }
    })

    const partialResult = await runWebMCPPlannerEvalCase(planner, tools, {
      name: 'partial product search',
      message: 'Find docks',
      expectedToolName: 'search_products',
      expectedInputSubset: {
        query: 'docks'
      }
    })

    expect(partialResult.passed).toBe(true)
  })

  it('checks ordered chained-plan steps', async () => {
    const planner = {
      name: 'Sequence planner',
      available: true,
      status: 'ready' as const,
      detail: 'Ready for tests.',
      async plan() {
        return {
          toolName: 'tool_sequence',
          input: {},
          confidence: 0.9,
          reason: 'Search, then select.',
          steps: [
            {
              toolName: 'search_products',
              input: { query: 'dock' },
              confidence: 0.9,
              reason: 'Find docks.'
            },
            {
              toolName: 'search_products',
              input: { query: 'keyboard' },
              confidence: 0.8,
              reason: 'Find keyboards.'
            }
          ]
        }
      }
    }

    const result = await runWebMCPPlannerEvalCase(planner, tools, {
      name: 'ordered search sequence',
      message: 'Find docks and keyboards',
      expectedToolName: 'tool_sequence',
      expectedSteps: [
        { toolName: 'search_products', inputSubset: { query: 'dock' } },
        { toolName: 'search_products', inputSubset: { query: 'keyboard' } }
      ]
    })

    expect(result.passed).toBe(true)
  })

  it('summarizes repeated runs against a pass-rate threshold', async () => {
    let run = 0
    const planner = {
      name: 'Variable planner',
      available: true,
      status: 'ready' as const,
      detail: 'Ready for tests.',
      async plan() {
        run += 1
        return {
          toolName: run === 2 ? 'no_tools_match' : 'search_products',
          input: run === 2 ? {} : { query: 'docks' },
          confidence: 0.8,
          reason: 'Variable test result.'
        }
      }
    }

    const summary = await runWebMCPPlannerEvalSuite(
      planner,
      tools,
      [
        {
          name: 'product search stability',
          message: 'Find docks',
          expectedToolName: 'search_products',
          expectedInput: { query: 'docks' }
        }
      ],
      {
        runsPerCase: 3,
        minimumPassRate: 0.66
      }
    )

    expect(summary).toMatchObject({
      plannerName: 'Variable planner',
      passed: true,
      minimumPassRate: 0.66,
      caseResults: [
        {
          name: 'product search stability',
          runs: 3,
          passes: 2,
          passRate: 2 / 3,
          passed: true
        }
      ]
    })
  })

  it('rejects empty eval suites', async () => {
    await expect(runWebMCPPlannerEvalSuite(createHeuristicPlanner(), tools, [])).rejects.toThrow(
      'testCases must contain at least one eval case.'
    )
  })

  it('rejects ambiguous case expectations before calling the planner', async () => {
    const planner = createHeuristicPlanner()
    const plan = vi.spyOn(planner, 'plan')
    const testCase = {
      name: 'ambiguous expectation',
      message: 'Find docks',
      expectedToolName: 'search_products',
      expectedOutcome: 'no_tools_match'
    } as unknown as WebMCPPlannerEvalCase

    await expect(runWebMCPPlannerEvalCase(planner, tools, testCase)).resolves.toMatchObject({
      passed: false,
      errors: ['Eval case must define exactly one of expectedToolName or expectedOutcome.']
    })
    expect(plan).not.toHaveBeenCalled()
  })
})
