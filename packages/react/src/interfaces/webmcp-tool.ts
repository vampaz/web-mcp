import type { RegisteredTool } from '@vampaz/webmcp-kit'

export interface UseWebMCPToolOptions {
  when?: boolean
}

export interface UseWebMCPToolResult<TInput = Record<string, unknown>, TOutput = unknown> {
  unregister: () => void
  getRegistration: () => RegisteredTool<TInput, TOutput> | undefined
}
