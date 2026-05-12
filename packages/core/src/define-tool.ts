import type { WebMCPTool } from './interfaces/tool'

export function defineTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>
): WebMCPTool<TInput, TOutput> {
  assertValidTool(tool)
  return tool
}

export function assertValidTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>
): void {
  if (!tool.name.trim()) {
    throw new Error('Tool name is required.')
  }

  if (!tool.description.trim()) {
    throw new Error(`Tool "${tool.name}" must include a description.`)
  }

  if (!tool.inputSchema || typeof tool.inputSchema !== 'object') {
    throw new Error(`Tool "${tool.name}" must include an input schema.`)
  }

  if (typeof tool.execute !== 'function') {
    throw new Error(`Tool "${tool.name}" must include an execute function.`)
  }
}
