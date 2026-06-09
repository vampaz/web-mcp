import { onMount } from 'svelte'
import type { Readable, Unsubscriber } from 'svelte/store'

import { registerTool, type RegisteredTool, type WebMCPTool } from 'webmcp-kit'

import type { UseWebMCPToolOptions, UseWebMCPToolResult } from './interfaces/webmcp-tool'

export type {
  SvelteWebMCPTool,
  UseWebMCPToolOptions,
  UseWebMCPToolResult
} from './interfaces/webmcp-tool'

export function useWebMCPTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>,
  options: UseWebMCPToolOptions = {}
): UseWebMCPToolResult<TInput, TOutput> {
  let registration: RegisteredTool<TInput, TOutput> | undefined
  let unsubscribe: Unsubscriber | undefined

  function unregister(): void {
    registration?.unregister()
    registration = undefined
  }

  function syncRegistration(available: boolean): void {
    if (available && !registration) {
      registration = registerTool(tool)
      return
    }

    if (!available) {
      unregister()
    }
  }

  onMount(function mountWebMCPTool() {
    if (isReadable(options.when)) {
      unsubscribe = options.when.subscribe(syncRegistration)
    } else {
      syncRegistration(
        options.when === undefined ||
          (typeof options.when === 'function' ? options.when() : options.when)
      )
    }

    return function disposeWebMCPTool() {
      unsubscribe?.()
      unsubscribe = undefined
      unregister()
    }
  })

  return {
    unregister,
    getRegistration() {
      return registration
    }
  }
}

function isReadable(value: UseWebMCPToolOptions['when']): value is Readable<boolean> {
  return !!value && typeof value === 'object' && 'subscribe' in value
}
