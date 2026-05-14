import type { WebMCPTool } from './interfaces/tool'
import { validateJsonSchema } from './schema'

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

  const inputSchemaErrors = validateJsonSchema(tool.inputSchema, 'inputSchema')
  if (inputSchemaErrors.length > 0) {
    throw new Error(`Tool "${tool.name}" has an invalid input schema: ${inputSchemaErrors.join(' ')}`)
  }

  if (tool.outputSchema) {
    const outputSchemaErrors = validateJsonSchema(tool.outputSchema, 'outputSchema')
    if (outputSchemaErrors.length > 0) {
      throw new Error(`Tool "${tool.name}" has an invalid output schema: ${outputSchemaErrors.join(' ')}`)
    }
  }

  if (typeof tool.execute !== 'function') {
    throw new Error(`Tool "${tool.name}" must include an execute function.`)
  }
}
