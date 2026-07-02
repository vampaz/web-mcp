import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { defineTool } from './define-tool'
import { initWebMCP } from './init'
import { hasConfirmationHandler, setConfirmationHandler } from './confirmation'
import { clearToolsForTest, getTool, invokeTool, listTools, registerTool } from './registry'

const paidAccessKey = 'wmcp_pk_test_access123_secret123secret456'

describe('initWebMCP', () => {
  beforeEach(() => {
    clearToolsForTest()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    setConfirmationHandler(undefined)
    document.body.innerHTML = ''
  })

  it('registers tools and creates a floating command input when none exists', () => {
    const handle = initWebMCP({
      placeholder: 'Ask the workspace...',
      tools: [createInitTool('select_items'), createInitTool('sort_items')]
    })

    expect(listTools()).toHaveLength(2)
    expect(document.querySelector('webmcp-command-input')).toBe(handle.element)
    expect(handle.element.hasAttribute('floating')).toBe(true)
    expect(handle.element.placeholder).toBe('Ask the workspace...')

    handle.destroy()

    expect(listTools()).toHaveLength(0)
    expect(document.querySelector('webmcp-command-input')).toBeNull()
  })

  it('reuses an existing command input element and keeps it on destroy', () => {
    const existing = document.createElement('webmcp-command-input')
    document.body.append(existing)

    const handle = initWebMCP({ tools: [createInitTool('select_items')] })

    expect(handle.element).toBe(existing)

    handle.destroy()

    expect(document.querySelector('webmcp-command-input')).toBe(existing)
  })

  it('throws when the target selector matches nothing', () => {
    expect(function initWithMissingTarget() {
      initWebMCP({ target: '#missing-command-input' })
    }).toThrowError('found no element matching "#missing-command-input"')
  })

  it('wires a hosted planner from an access key', () => {
    const handle = initWebMCP({
      accessKey: paidAccessKey,
      baseUrl: 'https://webmcp.example',
      model: 'gpt-5.4-mini'
    })

    expect(handle.planner?.name).toBe('Hosted OpenAI')
    expect(handle.planner?.status).toBe('ready')
    expect(handle.element.planner).toBe(handle.planner)

    handle.destroy()
  })

  it('throws when an access key is provided without a model', () => {
    expect(function initWithoutModel() {
      initWebMCP({ accessKey: paidAccessKey })
    }).toThrowError('needs a "model"')
  })
})

function createInitTool(name: string) {
  return defineTool({
    name,
    description: 'Operate on checklist items by stable ID.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['ids'],
      additionalProperties: false
    },
    execute(input) {
      return input.ids
    }
  })
}

describe('initWebMCP failure handling', () => {
  beforeEach(() => {
    clearToolsForTest()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    setConfirmationHandler(undefined)
    document.body.innerHTML = ''
  })

  it('leaves no side effects when the hosted planner options are invalid', () => {
    expect(function initWithoutModel() {
      initWebMCP({
        accessKey: paidAccessKey,
        confirmationHandler: () => true,
        tools: [createInitTool('select_items')]
      })
    }).toThrowError('needs a "model"')

    expect(listTools()).toHaveLength(0)
    expect(hasConfirmationHandler()).toBe(false)
    expect(document.querySelector('webmcp-command-input')).toBeNull()
  })

  it('rolls back registrations and a created element when a tool is invalid', () => {
    const invalidTool = {
      ...createInitTool('sort_items'),
      name: ''
    }

    expect(function initWithInvalidTool() {
      initWebMCP({
        confirmationHandler: () => true,
        tools: [createInitTool('select_items'), invalidTool]
      })
    }).toThrowError('Tool name is required.')

    expect(listTools()).toHaveLength(0)
    expect(hasConfirmationHandler()).toBe(false)
    expect(document.querySelector('webmcp-command-input')).toBeNull()
  })

  it('does not clear a newer handle confirmation handler on destroy', () => {
    const first = initWebMCP({ confirmationHandler: () => true })
    const second = initWebMCP({ confirmationHandler: () => false })

    first.destroy()

    expect(hasConfirmationHandler()).toBe(true)

    second.destroy()

    expect(hasConfirmationHandler()).toBe(false)
  })

  it('restores a pre-existing confirmation handler on destroy', async () => {
    setConfirmationHandler(() => false)
    const handle = initWebMCP({ confirmationHandler: () => true })
    registerTool(createConfirmedTool('delete_invoice'))

    await expect(
      invokeTool({
        toolName: 'delete_invoice',
        input: { id: 'inv_1' }
      })
    ).resolves.toMatchObject({ status: 'success' })

    handle.destroy()

    await expect(
      invokeTool({
        toolName: 'delete_invoice',
        input: { id: 'inv_1' }
      })
    ).resolves.toMatchObject({ status: 'blocked' })
  })

  it('rejects existing tool names before replacing registered tools', () => {
    const existing = registerTool(createInitTool('select_items'))

    expect(function initWithExistingToolName() {
      initWebMCP({
        tools: [createInitTool('select_items')]
      })
    }).toThrowError('a tool with that name is already registered')

    expect(getTool('select_items')).toBe(existing)
  })
})

function createConfirmedTool(name: string) {
  return defineTool({
    name,
    description: 'Delete an invoice after approval.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      },
      required: ['id'],
      additionalProperties: false
    },
    confirmation: {
      required: true,
      reason: 'Deleting an invoice cannot be undone.'
    },
    execute(input) {
      return input
    }
  })
}
