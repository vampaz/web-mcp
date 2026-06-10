import { describe, expect, it } from 'vitest'

import { defineTool } from './define-tool'

describe('defineTool', () => {
  it.each(['needs_clarification', 'no_tools_match', 'tool_sequence'])(
    'rejects the reserved planner name "%s"',
    (reservedName) => {
      expect(function defineReservedTool() {
        defineTool({
          name: reservedName,
          description: 'A tool that collides with a reserved planner name.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
            additionalProperties: false
          },
          execute() {
            return {}
          }
        })
      }).toThrowError(`Tool name "${reservedName}" is reserved`)
    }
  )

  it('accepts non-reserved tool names', () => {
    const tool = defineTool({
      name: 'select_items',
      description: 'Select checklist items.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false
      },
      execute() {
        return {}
      }
    })

    expect(tool.name).toBe('select_items')
  })
})
