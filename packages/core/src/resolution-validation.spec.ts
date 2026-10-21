import { describe, expect, it } from 'vitest'

import {
  createStructuredToolResolutionSchema,
  validateToolResolution
} from './resolution-validation'
import { validateJsonValue } from './schema'

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

  it('constrains generated arguments instead of allowing resolver metadata inside tool input', () => {
    const schema = createStructuredToolResolutionSchema([
      ...tools,
      { name: 'open_object', inputSchema: { type: 'object' } },
      {
        name: 'pi_reply',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
          additionalProperties: false
        }
      }
    ])
    const reply = {
      toolName: 'pi_reply',
      input: { text: 'All proposals were accepted.' },
      confidence: 1,
      reason: 'Every save succeeded.'
    }
    function errors(action: unknown) {
      return validateJsonValue({ action }, schema)
    }
    expect(errors(reply)).toEqual([])
    expect(
      errors({ ...reply, input: { ...reply.input, confidence: 1, reason: reply.reason } })
    ).not.toEqual([])
    expect(errors({ ...reply, toolName: 'select_items', input: { ids: ['a'] } })).toEqual([])
    expect(errors({ ...reply, toolName: 'needs_clarification', input: {} })).toEqual([])
    expect(errors({ ...reply, input: { ids: [42] } })).not.toEqual([])
    expect(errors({ ...reply, input: {} })).not.toEqual([])
    expect(errors({ ...reply, input: { ids: ['a'] } })).not.toEqual([])
  })

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
