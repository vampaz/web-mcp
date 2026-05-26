import { describe, expect, it } from 'vitest'

import { validateToolPlan } from './plan-validation'

describe('tool plan validation', () => {
  const tools = [
    {
      name: 'select_items',
      inputSchema: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: {
              type: 'string'
            }
          }
        },
        required: ['ids'],
        additionalProperties: false
      }
    }
  ]

  it('validates single tool plans against the selected tool schema', () => {
    expect(function validateInvalidPlan() {
      validateToolPlan(
        {
          toolName: 'select_items',
          input: {},
          confidence: 0.9,
          reason: 'Missing required input.'
        },
        tools
      )
    }).toThrow('provider returned invalid input for "select_items"')
  })

  it('validates tool sequences with server-style messages', () => {
    expect(function validateInvalidServerPlan() {
      validateToolPlan(
        {
          toolName: 'tool_sequence',
          input: {},
          confidence: 0.9,
          reason: 'Too many steps.',
          steps: [
            {
              toolName: 'select_items',
              input: {},
              confidence: 0.9,
              reason: 'Missing required input.'
            }
          ]
        },
        tools,
        { messageStyle: 'server' }
      )
    }).toThrow('Invalid tool input: input validation failed: /ids is required.')
  })
})
