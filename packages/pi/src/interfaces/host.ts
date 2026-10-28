import type {
  JsonSchema,
  ResolverContext,
  ToolAnnotations,
  ToolInvocationResult,
  WebMCPTool
} from '@vampaz/webmcp-kit'

export interface PiToolDescription {
  name: string
  description: string
  inputSchema: JsonSchema
  outputSchema?: JsonSchema
  annotations?: ToolAnnotations
}

export interface RegistryToolHostOptions {
  /** Limits discovery and invocation to tools intended for this agent. */
  include?(tool: WebMCPTool): boolean
}

export interface PiToolCatalog {
  revision: string
  tools: PiToolDescription[]
}

export type PiToolPhase = 'approval' | 'running'

export interface PiToolHost {
  discover(signal: AbortSignal): Promise<PiToolCatalog>
  context(signal: AbortSignal): Promise<ResolverContext>
  invoke(
    call: { name: string; input: Record<string, unknown>; revision: string },
    signal: AbortSignal,
    /** Optional progress for UI activity; hosts without approval phases may ignore it. */
    progress?: (phase: PiToolPhase) => void
  ): Promise<ToolInvocationResult>
}
