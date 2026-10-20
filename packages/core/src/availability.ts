import type { ToolScopeResult, WebMCPTool } from './interfaces/tool'

export function getToolAvailability(
  tool: Pick<WebMCPTool, 'scope'>
): ToolScopeResult & { failed?: boolean } {
  try {
    return tool.scope?.() ?? { available: true }
  } catch (error) {
    return {
      available: false,
      failed: true,
      reason: error instanceof Error ? error.message : 'Tool scope failed.'
    }
  }
}
