import { getCurrentInstance, onMounted, onScopeDispose, toValue, watch } from 'vue'

import type { WebMCPTool } from '@vampaz/webmcp-kit'
import { createToolRegistrationHandle } from '../../core/src/tool-registration'

import type { UseWebMCPToolOptions, UseWebMCPToolResult } from './interfaces/webmcp-tool'

export type { UseWebMCPToolOptions, UseWebMCPToolResult } from './interfaces/webmcp-tool'

export function useWebMCPTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>,
  options: UseWebMCPToolOptions = {}
): UseWebMCPToolResult<TInput, TOutput> {
  const handle = createToolRegistrationHandle(tool)
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
