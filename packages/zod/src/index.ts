import { defineTool, type JsonSchema } from '@vampaz/webmcp-kit'
import { toJSONSchema } from 'zod'
import type * as z from 'zod'

import type { DefineZodToolOptions, ZodWebMCPTool } from './interfaces/zod-tool'

export type { DefineZodToolOptions, ZodWebMCPTool } from './interfaces/zod-tool'

export function defineZodTool<TSchema extends z.ZodType, TOutput = unknown>(
  options: DefineZodToolOptions<TSchema, TOutput>
): ZodWebMCPTool<TSchema, TOutput> {
  const inputSchema = toJSONSchema(options.schema) as JsonSchema

  return defineTool<z.infer<TSchema>, TOutput>({
    name: options.name,
    description: options.description,
    inputSchema,
    outputSchema: options.outputSchema,
    confirmation: options.confirmation,
    examples: options.examples,
    scope: options.scope,
    guard: options.guard,
    execute(input, context) {
      return options.execute(options.schema.parse(input), context)
    }
  })
}
