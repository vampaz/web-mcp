import type { ToolInvocationResult } from '@vampaz/webmcp-kit'

export interface PiActionOutcome {
  toolName: string
  input: Record<string, unknown>
  status: ToolInvocationResult['status']
}
