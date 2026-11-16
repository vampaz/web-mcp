import type { ToolScopeResult, WebMCPTool } from './interfaces/tool'

export function getToolAvailability(
  tool: Pick<WebMCPTool, 'scope'>
): ToolScopeResult & { failed?: boolean } {
  try {
    if (!tool.scope) return { available: true }
    const result = tool.scope()
    if (!result || typeof result !== 'object' || typeof result.available !== 'boolean') {
      return {
        available: false,
        failed: true,
        reason: 'Tool scope returned an invalid result.'
      }
    }
    return result
  } catch (error) {
    return {
      available: false,
      failed: true,
      reason: error instanceof Error ? error.message : 'Tool scope failed.'
    }
  }
}
