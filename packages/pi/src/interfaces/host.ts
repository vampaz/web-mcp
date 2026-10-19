import type { JsonSchema, ResolverContext, ToolInvocationResult } from '@vampaz/webmcp-kit'

export interface PiToolDescription {
  name: string
  description: string
  inputSchema: JsonSchema
}

export interface PiToolCatalog {
  revision: string
  tools: PiToolDescription[]
}

export interface PiToolHost {
  discover(signal: AbortSignal): Promise<PiToolCatalog>
  context(signal: AbortSignal): Promise<ResolverContext>
  invoke(
    call: { name: string; input: Record<string, unknown>; revision: string },
    signal: AbortSignal
  ): Promise<ToolInvocationResult>
}
