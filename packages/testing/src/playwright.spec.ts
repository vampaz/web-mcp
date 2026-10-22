import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { defineTool, registerTool } from '@vampaz/webmcp-kit'

import { clearToolsForTest, installWebMCPKitTestBridge } from './index'
import {
  getWebMCPRegistrySnapshot,
  invokeWebMCPTool,
  listWebMCPTools,
  waitForWebMCPTool,
  type WebMCPTestingPage
} from './playwright'

const missingBridgeMessage =
  'WebMCP Kit test bridge is not installed. Call installWebMCPKitTestBridge() in the app before using Playwright helpers.'

describe('Playwright helpers', () => {
  beforeEach(() => {
    clearToolsForTest()
    delete window.__webMCPKit
  })

  afterEach(() => {
    clearToolsForTest()
    delete window.__webMCPKit
  })

  function createTool(name: string, available = true) {
    return defineTool({
      name,
      description: `Run ${name} in the current page.`,
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
        additionalProperties: false
      },
      scope() {
        return { available, reason: available ? undefined : 'Sign in first.' }
      },
      execute(input) {
        return { matches: [input.query] }
      }
    })
  }

  it('reads the registry snapshot through the test bridge', async () => {
    installWebMCPKitTestBridge()
    registerTool(createTool('search_products'))

    await expect(getWebMCPRegistrySnapshot(createFakePage().page)).resolves.toMatchObject({
      supportLabel: 'Fallback registry active',
      nativeWebMCP: false,
      toolCount: 1,
      tools: [{ name: 'search_products', mode: 'fallback', available: true }]
    })
  })

  it('lists tool summaries with their current availability', async () => {
    installWebMCPKitTestBridge()
    registerTool(createTool('search_products'))
    registerTool(createTool('checkout_cart', false))

    await expect(listWebMCPTools(createFakePage().page)).resolves.toMatchObject([
      { name: 'search_products', available: true },
      { name: 'checkout_cart', available: false, unavailableReason: 'Sign in first.' }
    ])
  })

  it('sends the invocation to the page and returns the result', async () => {
    installWebMCPKitTestBridge()
    registerTool(createTool('search_products'))
    const { evaluateArgs, page } = createFakePage()
    const invocation = { toolName: 'search_products', input: { query: 'dock' } }

    await expect(invokeWebMCPTool(page, invocation)).resolves.toMatchObject({
      toolName: 'search_products',
      status: 'success',
      output: { matches: ['dock'] }
    })
    expect(evaluateArgs).toEqual([invocation])
  })

  it.each([
    ['getWebMCPRegistrySnapshot', getWebMCPRegistrySnapshot],
    ['listWebMCPTools', listWebMCPTools],
    [
      'invokeWebMCPTool',
      function invoke(page: WebMCPTestingPage) {
        return invokeWebMCPTool(page, { toolName: 'search_products', input: {} })
      }
    ]
  ])('%s rejects when the test bridge is missing', async (_name, helper) => {
    await expect(helper(createFakePage().page)).rejects.toThrow(missingBridgeMessage)
  })

  it('waits until the named tool is registered', async () => {
    const { page, polls } = createFakePage([
      function installBridgeWithOtherTool() {
        installWebMCPKitTestBridge()
        registerTool(createTool('read_cart'))
      },
      function registerExpectedTool() {
        registerTool(createTool('search_products'))
      }
    ])

    await expect(waitForWebMCPTool(page, 'search_products')).resolves.toMatchObject({
      name: 'search_products',
      available: true
    })
    expect(polls).toEqual([false, false, expect.objectContaining({ name: 'search_products' })])
  })
})

/** Runs page functions in the jsdom window and clones values like Playwright serialization. */
function createFakePage(betweenPolls: Array<() => void> = []) {
  const evaluateArgs: unknown[] = []
  const polls: unknown[] = []
  const page = {
    async evaluate(pageFunction: (arg?: unknown) => unknown, arg?: unknown) {
      evaluateArgs.push(arg)
      return structuredClone(await pageFunction(structuredClone(arg)))
    },
    async waitForFunction(pageFunction: (arg: unknown) => unknown, arg: unknown) {
      for (let poll = 0; ; poll += 1) {
        const value = pageFunction(structuredClone(arg))
        polls.push(value)
        if (value) {
          return {
            async jsonValue() {
              return structuredClone(value)
            }
          }
        }
        const next = betweenPolls[poll]
        if (!next) throw new Error('waitForFunction timed out.')
        next()
      }
    }
  } as WebMCPTestingPage

  return { evaluateArgs, page, polls }
}
