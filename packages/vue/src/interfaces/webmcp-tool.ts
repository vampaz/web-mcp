import type { MaybeRefOrGetter } from 'vue'

import type { RegisteredTool, WebMCPTool } from '@vampaz/webmcp-kit'

export interface UseWebMCPToolOptions {
  when?: MaybeRefOrGetter<boolean>
}

export interface UseWebMCPToolResult<TInput = Record<string, unknown>, TOutput = unknown> {
  unregister: () => void
  getRegistration: () => RegisteredTool<TInput, TOutput> | undefined
}

export type VueWebMCPTool<TInput = Record<string, unknown>, TOutput = unknown> = WebMCPTool<
  TInput,
  TOutput
>
