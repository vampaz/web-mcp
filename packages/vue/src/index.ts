import { onScopeDispose, toValue, watch } from 'vue'

import { registerTool, type RegisteredTool, type WebMCPTool } from '@webmcp-kit/core'

import type { UseWebMCPToolOptions, UseWebMCPToolResult } from './interfaces/webmcp-tool'

export type {
  UseWebMCPToolOptions,
  UseWebMCPToolResult,
  VueWebMCPTool
} from './interfaces/webmcp-tool'

export function useWebMCPTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>,
  options: UseWebMCPToolOptions = {}
): UseWebMCPToolResult<TInput, TOutput> {
  let registration: RegisteredTool<TInput, TOutput> | undefined

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

  const stop = watch(
    function getAvailability() {
      return options.when === undefined || toValue(options.when)
    },
    syncRegistration,
    { immediate: true }
  )

  onScopeDispose(function disposeWebMCPTool() {
    stop()
    unregister()
  })

  return {
    unregister,
    getRegistration() {
      return registration
    }
  }
}
