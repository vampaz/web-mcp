import type { WebMCPTool } from '@webmcp-kit/core'

export interface UseWebMCPToolOptions {
  when?: boolean | (() => boolean)
}

export type ReactWebMCPTool<TInput = Record<string, unknown>, TOutput = unknown> = WebMCPTool<
  TInput,
  TOutput
>
