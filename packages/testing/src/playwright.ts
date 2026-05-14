import type { Page } from '@playwright/test'
import type { TestBridgeSnapshot, TestBridgeTool, ToolInvocation, ToolInvocationResult } from '@webmcp-kit/core'

export async function getWebMCPRegistrySnapshot(page: Page): Promise<TestBridgeSnapshot> {
  return page.evaluate(function getSnapshot() {
    const bridge = window.__webMCPKit
    if (!bridge) {
      throw new Error('WebMCP Kit test bridge is not installed. Call installWebMCPKitTestBridge() in the app before using Playwright helpers.')
    }

    return bridge.getRegistrySnapshot()
  })
}

export async function listWebMCPTools(page: Page): Promise<TestBridgeTool[]> {
  return page.evaluate(function getTools() {
    const bridge = window.__webMCPKit
    if (!bridge) {
      throw new Error('WebMCP Kit test bridge is not installed. Call installWebMCPKitTestBridge() in the app before using Playwright helpers.')
    }

    return bridge.listTools()
  })
}

export async function invokeWebMCPTool<TOutput = unknown>(
  page: Page,
  invocation: ToolInvocation
): Promise<ToolInvocationResult<TOutput>> {
  return page.evaluate(function invoke(invocationInPage) {
    const bridge = window.__webMCPKit
    if (!bridge) {
      throw new Error('WebMCP Kit test bridge is not installed. Call installWebMCPKitTestBridge() in the app before using Playwright helpers.')
    }

    return bridge.invokeTool(invocationInPage)
  }, invocation)
}

export async function waitForWebMCPTool(page: Page, toolName: string): Promise<TestBridgeTool> {
  const handle = await page.waitForFunction(function findTool(name) {
    const bridge = window.__webMCPKit
    if (!bridge) return false

    return bridge.listTools().find(function matchesTool(tool) {
      return tool.name === name
    }) ?? false
  }, toolName)

  return handle.jsonValue() as Promise<TestBridgeTool>
}
