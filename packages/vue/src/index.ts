import { getCurrentInstance, onMounted, onScopeDispose, toValue, watch } from 'vue'

import type { WebMCPTool } from '@vampaz/webmcp-kit'
import {
  createToolRegistrationHandle,
  createToolsRegistrationHandle
} from '../../core/src/tool-registration'

import type {
  UseWebMCPToolOptions,
  UseWebMCPToolResult,
  UseWebMCPToolsResult
} from './interfaces/webmcp-tool'

export type {
  UseWebMCPToolOptions,
  UseWebMCPToolResult,
  UseWebMCPToolsResult
} from './interfaces/webmcp-tool'

export function useWebMCPTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>,
  options: UseWebMCPToolOptions = {}
): UseWebMCPToolResult<TInput, TOutput> {
  return bindRegistration(createToolRegistrationHandle(tool), options)
}

/** Registers the tools as one atomic set for the current component or effect scope. */
export function useWebMCPTools(
  tools: readonly WebMCPTool[],
  options: UseWebMCPToolOptions = {}
): UseWebMCPToolsResult {
  return bindRegistration(createToolsRegistrationHandle(tools), options)
}

function bindRegistration<
  THandle extends { sync: (available: boolean) => void; unregister: () => void }
>(handle: THandle, options: UseWebMCPToolOptions): THandle {
  const component = getCurrentInstance()
  let mounted = component ? component.isMounted : typeof window !== 'undefined'

  function available() {
    return options.when === undefined || toValue(options.when)
  }

  function sync() {
    handle.sync(mounted && available())
  }

  if (component && !mounted)
    onMounted(function mount() {
      mounted = true
      sync()
    })
  const stop = watch(available, sync, { immediate: true })
  onScopeDispose(function disposeWebMCPTool() {
    stop()
    handle.unregister()
  })
  return handle
}
