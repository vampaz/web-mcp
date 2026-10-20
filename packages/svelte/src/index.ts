import { onMount } from 'svelte'
import type { Readable, Unsubscriber } from 'svelte/store'

import type { WebMCPTool } from '@vampaz/webmcp-kit'
import { createToolRegistrationHandle } from '../../core/src/tool-registration'

import type { UseWebMCPToolOptions, UseWebMCPToolResult } from './interfaces/webmcp-tool'

export type { UseWebMCPToolOptions, UseWebMCPToolResult } from './interfaces/webmcp-tool'

export function useWebMCPTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>,
  options: UseWebMCPToolOptions = {}
): UseWebMCPToolResult<TInput, TOutput> {
  const handle = createToolRegistrationHandle(tool)
  let unsubscribe: Unsubscriber | undefined

  onMount(function mountWebMCPTool() {
    if (isReadable(options.when)) {
      unsubscribe = options.when.subscribe(handle.sync)
    } else {
      handle.sync(options.when === undefined || options.when === true)
    }

    return function disposeWebMCPTool() {
      unsubscribe?.()
      unsubscribe = undefined
      handle.unregister()
    }
  })

  return handle
}

function isReadable(value: UseWebMCPToolOptions['when']): value is Readable<boolean> {
  return !!value && typeof value === 'object' && 'subscribe' in value
}
