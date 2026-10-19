import { describe, expect, it, vi } from 'vitest'

import { createHeuristicResolver, defineTool } from '@vampaz/webmcp-kit'

import {
  runWebMCPResolverEvalCase,
  runWebMCPResolverEvalSuite,
  runWebMCPResolverEvals
} from './evals'
import type { WebMCPResolverEvalCase } from './interfaces/evals'

describe('resolver eval helpers', () => {
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

  it('returns a passing result when the resolver matches the expected tool and input', async () => {
    const resolver = createHeuristicResolver()
    const result = await runWebMCPResolverEvalCase(resolver, tools, {
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
    expect(result.resolution?.toolName).toBe('search_products')
  })

  it('reports mismatches without throwing', async () => {
    const resolver = createHeuristicResolver()
    const [result] = await runWebMCPResolverEvals(resolver, tools, [
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

  it('supports resolver outcomes and partial input expectations', async () => {
    const resolver = createHeuristicResolver()
    const result = await runWebMCPResolverEvalCase(resolver, tools, {
      name: 'unsupported request',
      message: 'Send the weekly report',
      expectedOutcome: 'no_tools_match'
    })

    expect(result).toMatchObject({
      passed: true,
      durationMs: expect.any(Number),
      resolution: {
        toolName: 'no_tools_match'
      }
    })

    const partialResult = await runWebMCPResolverEvalCase(resolver, tools, {
      name: 'partial product search',
      message: 'Find docks',
      expectedToolName: 'search_products',
      expectedInputSubset: {
        query: 'docks'
      }
    })

    expect(partialResult.passed).toBe(true)
  })

  it('checks ordered chained-resolution steps', async () => {
    const resolver = {
      name: 'Sequence resolver',
      available: true,
      status: 'ready' as const,
      detail: 'Ready for tests.',
      async resolve() {
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

    const result = await runWebMCPResolverEvalCase(resolver, tools, {
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
    const resolver = {
      name: 'Variable resolver',
      available: true,
      status: 'ready' as const,
      detail: 'Ready for tests.',
      async resolve() {
        run += 1
        return {
          toolName: run === 2 ? 'no_tools_match' : 'search_products',
          input: run === 2 ? {} : { query: 'docks' },
          confidence: 0.8,
          reason: 'Variable test result.'
        }
      }
    }

    const summary = await runWebMCPResolverEvalSuite(
      resolver,
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
      resolverName: 'Variable resolver',
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
    await expect(runWebMCPResolverEvalSuite(createHeuristicResolver(), tools, [])).rejects.toThrow(
      'testCases must contain at least one eval case.'
    )
  })

  it('rejects ambiguous case expectations before calling the resolver', async () => {
    const resolver = createHeuristicResolver()
    const resolution = vi.spyOn(resolver, 'resolve')
    const testCase = {
      name: 'ambiguous expectation',
      message: 'Find docks',
      expectedToolName: 'search_products',
      expectedOutcome: 'no_tools_match'
    } as unknown as WebMCPResolverEvalCase

    await expect(runWebMCPResolverEvalCase(resolver, tools, testCase)).resolves.toMatchObject({
      passed: false,
      errors: ['Eval case must define exactly one of expectedToolName or expectedOutcome.']
    })
    expect(resolution).not.toHaveBeenCalled()
  })
})
