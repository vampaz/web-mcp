import { onMount } from 'svelte'
import type { Readable, Unsubscriber } from 'svelte/store'

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

/** Registers the tools as one atomic set while the component is mounted. */
export function useWebMCPTools(
  tools: readonly WebMCPTool[],
  options: UseWebMCPToolOptions = {}
): UseWebMCPToolsResult {
  return bindRegistration(createToolsRegistrationHandle(tools), options)
}

function bindRegistration<
  THandle extends { sync: (available: boolean) => void; unregister: () => void }
>(handle: THandle, options: UseWebMCPToolOptions): THandle {
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
