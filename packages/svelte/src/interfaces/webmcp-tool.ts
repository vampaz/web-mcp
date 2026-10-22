import type { Readable } from 'svelte/store'

import type { RegisteredTool } from '@vampaz/webmcp-kit'

export interface UseWebMCPToolOptions {
  when?: boolean | Readable<boolean>
}

export interface UseWebMCPToolResult<TInput = Record<string, unknown>, TOutput = unknown> {
  unregister: () => void
  getRegistration: () => RegisteredTool<TInput, TOutput> | undefined
}

export interface UseWebMCPToolsResult {
  unregister: () => void
  getRegistrations: () => RegisteredTool[]
}
