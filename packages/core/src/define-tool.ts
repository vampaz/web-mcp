import type { InferToolInput } from './interfaces/schema-inference'
import type { JsonSchema, WebMCPTool } from './interfaces/tool'
import { WebMCPKitError } from './kit-error'
import { resolverOutcomeToolNames } from './resolution-validation'
import { validateJsonSchema } from './schema'

const reservedToolNames = new Set<string>(['tool_sequence', ...resolverOutcomeToolNames])

export type SchemaTypedWebMCPTool<TSchema extends JsonSchema, TOutput = unknown> = Omit<
  WebMCPTool<InferToolInput<TSchema>, TOutput>,
  'inputSchema' | 'execute' | 'guard'
> & {
  inputSchema: TSchema
  execute: (
    input: NoInfer<InferToolInput<TSchema>>,
    context: import('./interfaces/tool').ToolContext
  ) => TOutput | Promise<TOutput>
  guard?: (input: NoInfer<InferToolInput<TSchema>>) => boolean | string | Promise<boolean | string>
}

/** Defines a tool, validates its schema and handler, and infers the execute input type. Omit inputSchema for a strict empty object. */
export function defineTool<const TSchema extends JsonSchema, TOutput = unknown>(
  tool: SchemaTypedWebMCPTool<TSchema, TOutput>
): WebMCPTool<InferToolInput<TSchema>, TOutput>
export function defineTool<TOutput = unknown>(
  tool: Omit<WebMCPTool<Record<string, unknown>, TOutput>, 'inputSchema' | 'execute' | 'guard'> & {
    inputSchema?: never
    execute: (
      input: NoInfer<Record<string, unknown>>,
      context: import('./interfaces/tool').ToolContext
    ) => TOutput | Promise<TOutput>
    guard?: (
      input: NoInfer<Record<string, unknown>>
    ) => boolean | string | Promise<boolean | string>
  }
): WebMCPTool<Record<string, unknown>, TOutput>
export function defineTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: Omit<WebMCPTool<NoInfer<TInput>, TOutput>, 'execute' | 'guard'> & {
    execute: (
      input: NoInfer<TInput>,
      context: import('./interfaces/tool').ToolContext
    ) => TOutput | Promise<TOutput>
    guard?: (input: NoInfer<TInput>) => boolean | string | Promise<boolean | string>
  }
): WebMCPTool<TInput, TOutput>
export function defineTool(tool: object): object {
  const candidate = tool as WebMCPTool<never, unknown>
  const defined =
    candidate.inputSchema === undefined
      ? { ...candidate, inputSchema: createDefaultInputSchema() }
      : candidate
  assertValidTool(defined)
  return defined
}

function createDefaultInputSchema(): JsonSchema {
  return { type: 'object', properties: {}, additionalProperties: false }
}

export function assertValidTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>
): void {
  if (!tool.name.trim()) {
    throw new WebMCPKitError('invalid_definition', 'Tool name is required.')
  }

  if (reservedToolNames.has(tool.name)) {
    throw new WebMCPKitError(
      'invalid_definition',
      `Tool name "${tool.name}" is reserved for resolver outcomes and chained resolutions.`
    )
  }

  if (!tool.description.trim()) {
    throw new WebMCPKitError(
      'invalid_definition',
      `Tool "${tool.name}" must include a description.`
    )
  }

  if (!tool.inputSchema || typeof tool.inputSchema !== 'object') {
    throw new WebMCPKitError(
      'invalid_definition',
      `Tool "${tool.name}" must include an input schema.`
    )
  }

  const inputSchemaErrors = validateJsonSchema(tool.inputSchema, 'inputSchema')
  if (inputSchemaErrors.length > 0) {
    throw new WebMCPKitError(
      'invalid_definition',
      `Tool "${tool.name}" has an invalid input schema: ${inputSchemaErrors.join(' ')}`
    )
  }

  if (tool.outputSchema) {
    const outputSchemaErrors = validateJsonSchema(tool.outputSchema, 'outputSchema')
    if (outputSchemaErrors.length > 0) {
      throw new WebMCPKitError(
        'invalid_definition',
        `Tool "${tool.name}" has an invalid output schema: ${outputSchemaErrors.join(' ')}`
      )
    }
  }

  if (typeof tool.execute !== 'function') {
    throw new WebMCPKitError(
      'invalid_definition',
      `Tool "${tool.name}" must include an execute function.`
    )
  }
}
