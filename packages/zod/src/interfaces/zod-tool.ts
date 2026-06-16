import type {
  JsonSchema,
  ToolAnnotations,
  ToolConfirmation,
  ToolContext,
  ToolScopeResult,
  WebMCPTool
} from '@vampaz/webmcp-kit'
import type * as z from 'zod'

export interface DefineZodToolOptions<TSchema extends z.ZodType, TOutput = unknown> {
  name: string
  description: string
  schema: TSchema
  outputSchema?: JsonSchema
  annotations?: ToolAnnotations
  confirmation?: ToolConfirmation
  examples?: Array<z.infer<TSchema>>
  scope?: () => ToolScopeResult
  guard?: (input: z.infer<TSchema>) => boolean | string | Promise<boolean | string>
  execute: (input: z.infer<TSchema>, context: ToolContext) => Promise<TOutput> | TOutput
}

export type ZodWebMCPTool<TSchema extends z.ZodType, TOutput = unknown> = WebMCPTool<
  z.infer<TSchema>,
  TOutput
>
