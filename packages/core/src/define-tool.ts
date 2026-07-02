import type { InferToolInput } from './interfaces/schema-inference'
import type { JsonSchema, WebMCPTool } from './interfaces/tool'
import { plannerOutcomeToolNames } from './plan-validation'
import { validateJsonSchema } from './schema'

const reservedToolNames = new Set<string>(['tool_sequence', ...plannerOutcomeToolNames])

export type SchemaTypedWebMCPTool<TSchema extends JsonSchema, TOutput = unknown> = Omit<
  WebMCPTool<InferToolInput<TSchema>, TOutput>,
  'inputSchema'
> & { inputSchema: TSchema }

export function defineTool<const TSchema extends JsonSchema, TOutput = unknown>(
  tool: SchemaTypedWebMCPTool<TSchema, TOutput>
): WebMCPTool<InferToolInput<TSchema>, TOutput>
export function defineTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>
): WebMCPTool<TInput, TOutput>
export function defineTool(tool: object): object {
  assertValidTool(tool as WebMCPTool<never, unknown>)
  return tool
}

export function assertValidTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>
): void {
  if (!tool.name.trim()) {
    throw new Error('Tool name is required.')
  }

  if (reservedToolNames.has(tool.name)) {
    throw new Error(`Tool name "${tool.name}" is reserved for planner outcomes and chained plans.`)
  }

  if (!tool.description.trim()) {
    throw new Error(`Tool "${tool.name}" must include a description.`)
  }

  if (!tool.inputSchema || typeof tool.inputSchema !== 'object') {
    throw new Error(`Tool "${tool.name}" must include an input schema.`)
  }

  const inputSchemaErrors = validateJsonSchema(tool.inputSchema, 'inputSchema')
  if (inputSchemaErrors.length > 0) {
    throw new Error(
      `Tool "${tool.name}" has an invalid input schema: ${inputSchemaErrors.join(' ')}`
    )
  }

  if (tool.outputSchema) {
    const outputSchemaErrors = validateJsonSchema(tool.outputSchema, 'outputSchema')
    if (outputSchemaErrors.length > 0) {
      throw new Error(
        `Tool "${tool.name}" has an invalid output schema: ${outputSchemaErrors.join(' ')}`
      )
    }
  }

  if (typeof tool.execute !== 'function') {
    throw new Error(`Tool "${tool.name}" must include an execute function.`)
  }
}
