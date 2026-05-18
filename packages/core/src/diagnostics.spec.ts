import { beforeEach, describe, expect, it } from 'vitest'

import { setConfirmationHandler } from './confirmation'
import { defineTool } from './define-tool'
import { assertWebMCPIntegration, getIntegrationHealthReport } from './diagnostics'
import { clearToolsForTest, registerTool } from './registry'

describe('integration diagnostics', () => {
  beforeEach(() => {
    clearToolsForTest()
    setConfirmationHandler(undefined)
  })

  it('reports an error when no tools are registered', () => {
    const report = getIntegrationHealthReport()

    expect(report.status).toBe('error')
    expect(report.summary).toBe('1 integration error found.')
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      id: 'no-tools-registered',
      severity: 'error'
    }))
  })

  it('throws from assertWebMCPIntegration when the integration has errors', () => {
    expect(function assertEmptyIntegration() {
      assertWebMCPIntegration()
    }).toThrow('1 integration error found.')
  })

  it('reports schema and confirmation warnings for registered tools', () => {
    registerTool(defineTool({
      name: 'send_invoice',
      description: 'Send the selected invoice to the customer after the user reviews it.',
      inputSchema: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string' }
        },
        required: ['invoiceId']
      },
      confirmation: {
        required: true,
        reason: 'This sends an invoice email to the customer.'
      },
      execute() {
        return { sent: true }
      }
    }))

    const report = getIntegrationHealthReport()

    expect(report.status).toBe('warning')
    expect(report.summary).toBe('1 tool registered with 2 warnings.')
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      id: 'schema-allows-extra-properties:send_invoice',
      severity: 'warning'
    }))
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      id: 'missing-confirmation-handler:send_invoice',
      severity: 'warning'
    }))
  })

  it('returns ready when tools are strict and confirmation is configured', () => {
    setConfirmationHandler(function confirmAction() {
      return true
    })

    registerTool(defineTool({
      name: 'create_invoice',
      description: 'Create a draft invoice for a customer and add it to the local invoice list.',
      inputSchema: {
        type: 'object',
        properties: {
          invoiceId: { type: 'string' }
        },
        required: ['invoiceId'],
        additionalProperties: false
      },
      execute() {
        return { created: true }
      }
    }))

    const report = getIntegrationHealthReport()

    expect(report.status).toBe('ready')
    expect(report.summary).toBe('1 tool registered and ready.')
    expect(report.diagnostics).toEqual([])
  })

  it('reports scope failures without throwing', () => {
    registerTool(defineTool({
      name: 'select_items',
      description: 'Select matching inventory items from the current visible list.',
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
      scope() {
        throw new Error('missing list state')
      },
      execute() {
        return { selected: true }
      }
    }))

    const report = getIntegrationHealthReport()

    expect(report.status).toBe('error')
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      id: 'tool-scope-failed:select_items',
      severity: 'error',
      detail: 'missing list state'
    }))
  })

  it('includes planner readiness when provided', () => {
    registerTool(defineTool({
      name: 'select_items',
      description: 'Select matching inventory items from the current visible list.',
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
      execute() {
        return { selected: true }
      }
    }))

    const report = getIntegrationHealthReport({
      planner: {
        name: 'Cloudflare binding',
        available: true,
        status: 'ready',
        detail: 'Workers AI binding is available.',
        plan() {
          return Promise.resolve({
            toolName: 'select_items',
            input: { ids: [] },
            confidence: 1,
            reason: 'test'
          })
        }
      }
    })

    expect(report.status).toBe('ready')
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      id: 'planner-ready',
      severity: 'info'
    }))
  })
})
