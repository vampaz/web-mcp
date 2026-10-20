import { defineTool, type JsonSchema } from '@vampaz/webmcp-kit'
import { toJSONSchema } from 'zod'
import type * as z from 'zod'

import type { DefineZodToolOptions, ZodWebMCPTool } from './interfaces/zod-tool'

export type { DefineZodToolOptions, ZodWebMCPTool } from './interfaces/zod-tool'

export function defineZodTool<TSchema extends z.ZodType, TOutput = unknown>(
  options: DefineZodToolOptions<TSchema, TOutput>
): ZodWebMCPTool<TSchema, TOutput> {
  const inputSchema = toJSONSchema(options.schema, { io: 'input' }) as JsonSchema

  return defineTool<z.infer<TSchema>, TOutput>({
    name: options.name,
    description: options.description,
    inputSchema,
    outputSchema: options.outputSchema,
    annotations: options.annotations,
    confirmation: options.confirmation,
    examples: options.examples,
    scope: options.scope,
    guard: options.guard,
    parseInput(input) {
      return options.schema.parseAsync(input)
    },
    execute: options.execute
  })
}
