import { describe, expect, it } from 'vitest'

import { createHeuristicPlanner, defineTool } from 'webmcp-kit'

import { runWebMCPPlannerEvalCase, runWebMCPPlannerEvals } from './evals'

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
})
