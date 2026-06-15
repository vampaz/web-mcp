import type { Readable } from 'svelte/store'

import type { RegisteredTool, WebMCPTool } from '@vampaz/webmcp-kit'

export interface UseWebMCPToolOptions {
  when?: boolean | (() => boolean) | Readable<boolean>
}

export interface UseWebMCPToolResult<TInput = Record<string, unknown>, TOutput = unknown> {
  unregister: () => void
  getRegistration: () => RegisteredTool<TInput, TOutput> | undefined
}

export type SvelteWebMCPTool<TInput = Record<string, unknown>, TOutput = unknown> = WebMCPTool<
  TInput,
  TOutput
>
