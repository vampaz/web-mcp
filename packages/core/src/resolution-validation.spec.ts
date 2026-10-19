import { describe, expect, it } from 'vitest'

import { validateToolResolution } from './resolution-validation'

describe('tool resolution validation', () => {
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

  it('validates single tool resolutions against the selected tool schema', () => {
    expect(function validateInvalidResolution() {
      validateToolResolution(
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

  it('accepts unknown values so callers can validate untrusted provider output', () => {
    expect(function validateUnknownResolution() {
      validateToolResolution('not a resolution', tools)
    }).toThrow('provider returned an invalid resolution')
  })

  it('rejects non-finite confidence values', () => {
    expect(function validateInvalidConfidenceResolution() {
      validateToolResolution(
        {
          toolName: 'select_items',
          input: { ids: [] },
          confidence: Infinity,
          reason: 'Non-finite confidence.'
        },
        tools
      )
    }).toThrow('provider returned a resolution without numeric confidence')
  })

  it('accepts resolver outcome resolutions without registered tools', () => {
    expect(function validateNoMatchResolution() {
      validateToolResolution(
        {
          toolName: 'no_tools_match',
          input: {},
          confidence: 0,
          reason: 'No available tool can satisfy this request.'
        },
        []
      )
    }).not.toThrow()
  })

  it('rejects resolver outcomes that include executable steps', () => {
    expect(function validateOutcomeWithSteps() {
      validateToolResolution(
        {
          toolName: 'needs_clarification',
          input: {},
          confidence: 0,
          reason: 'Missing item IDs.',
          steps: [
            {
              toolName: 'select_items',
              input: { ids: [] },
              confidence: 0.5,
              reason: 'Should not execute.'
            }
          ]
        },
        tools
      )
    }).toThrow('provider returned a resolver outcome with steps')
  })

  it('validates tool sequences with server-style messages', () => {
    expect(function validateInvalidServerResolution() {
      validateToolResolution(
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
