import type { JsonSchema, ToolAnnotations, ToolResolver } from '@vampaz/webmcp-kit'

export interface NativeAgentTool {
  name: string
  description: string
  inputSchema: JsonSchema
  annotations?: ToolAnnotations
  outputSchema?: JsonSchema
}

export interface NativeAgentStep {
  toolName: string
  input: Record<string, unknown>
  result: unknown
}

export interface NativeAgentEvaluation {
  outcome:
    | 'replied'
    | 'tool_error'
    | 'limit_reached'
    | 'needs_clarification'
    | 'no_tools_match'
    | 'resolver_error'
  reply?: string
  steps: NativeAgentStep[]
  toolCalls: number
  repeatedCalls: number
  catalogBytes: number
  resultBytes: number
  resolverInputBytes: number
  resolverErrors: string[]
}

export interface NativeAgentOptions {
  resolver: ToolResolver
  message: string
  maxToolCalls?: number
}
