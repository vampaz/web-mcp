import { afterEach, describe, expect, it } from 'vitest'
import { defineTool } from './define-tool'
import { initWebMCP } from './init'
import { isWebMCPKitError, WebMCPKitError, type WebMCPKitErrorCode } from './kit-error'
import { clearToolsForTest, registerTool } from './registry'

afterEach(function cleanup() {
  clearToolsForTest()
  document.body.replaceChildren()
})

function capture(action: () => void): unknown {
  try {
    action()
  } catch (error) {
    return error
  }
  return undefined
}

function expectCode(error: unknown, code: WebMCPKitErrorCode, message: string) {
  expect(error).toBeInstanceOf(WebMCPKitError)
  expect(isWebMCPKitError(error)).toBe(true)
  expect(error).toMatchObject({ name: 'WebMCPKitError', code, message })
}

describe('WebMCPKitError', function errors() {
  it('codes definition failures without changing their messages', function definition() {
    expectCode(
      capture(function invalid() {
        defineTool({
          name: '',
          description: 'A tool without a name.',
          execute() {
            return {}
          }
        })
      }),
      'invalid_definition',
      'Tool name is required.'
    )
  })

  it('codes registration duplicates without changing their messages', function duplicate() {
    const tool = defineTool({
      name: 'read_value',
      description: 'Read the visible application value.',
      execute() {
        return { value: 1 }
      }
    })
    registerTool(tool)
    expectCode(
      capture(function registerAgain() {
        registerTool(tool)
      }),
      'duplicate_tool',
      'Tool "read_value" is already registered. Unregister it before registering another tool with the same name.'
    )
  })

  it('codes init configuration and duplicate failures', function init() {
    expectCode(
      capture(function missingTarget() {
        initWebMCP({ target: '#missing-command-input' })
      }),
      'invalid_configuration',
      'initWebMCP() found no element matching "#missing-command-input".'
    )

    const tool = defineTool({
      name: 'read_value',
      description: 'Read the visible application value.',
      execute() {
        return { value: 1 }
      }
    })
    expectCode(
      capture(function duplicateTools() {
        initWebMCP({ tools: [tool, tool] })
      }),
      'duplicate_tool',
      'initWebMCP() received duplicate tool name "read_value".'
    )
  })

  it('uses instanceof, matching the existing ResolverError guard pattern', function realm() {
    expect(isWebMCPKitError({ code: 'duplicate_tool', message: 'lookalike' })).toBe(false)
    expect(isWebMCPKitError(new Error('plain'))).toBe(false)
  })
})
