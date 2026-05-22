import type { Readable } from 'svelte/store'

import type { WebMCPTool } from '@webmcp-kit/core'

export interface UseWebMCPToolOptions {
  when?: boolean | (() => boolean) | Readable<boolean>
}

export type SvelteWebMCPTool<TInput = Record<string, unknown>, TOutput = unknown> = WebMCPTool<
  TInput,
  TOutput
>
