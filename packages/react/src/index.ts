import { useEffect, useRef } from 'react'

import { registerTool, type RegisteredTool, type WebMCPTool } from '@vampaz/webmcp-kit'

import type { UseWebMCPToolOptions, UseWebMCPToolResult } from './interfaces/webmcp-tool'

export type {
  ReactWebMCPTool,
  UseWebMCPToolOptions,
  UseWebMCPToolResult
} from './interfaces/webmcp-tool'

export function useWebMCPTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>,
  options: UseWebMCPToolOptions = {}
): UseWebMCPToolResult<TInput, TOutput> {
  const registration = useRef<RegisteredTool<TInput, TOutput> | undefined>(undefined)
  const registeredTool = useRef<WebMCPTool<TInput, TOutput> | undefined>(undefined)
  const handle = useRef<UseWebMCPToolResult<TInput, TOutput> | undefined>(undefined)
  const available = resolveWhenOption(options.when)

  useEffect(
    function syncWebMCPTool() {
      if (registration.current && registeredTool.current !== tool) {
        registration.current?.unregister()
        registration.current = undefined
        registeredTool.current = undefined
      }

      if (available && !registration.current) {
        registration.current = registerTool(tool)
        registeredTool.current = tool
      }

      if (!available) {
        registration.current?.unregister()
        registration.current = undefined
        registeredTool.current = undefined
      }

      return function disposeWebMCPTool() {
        registration.current?.unregister()
        registration.current = undefined
        registeredTool.current = undefined
      }
    },
    [tool, available]
  )

  if (!handle.current) {
    handle.current = {
      unregister() {
        registration.current?.unregister()
        registration.current = undefined
        registeredTool.current = undefined
      },
      getRegistration() {
        return registration.current
      }
    }
  }

  return handle.current
}

function resolveWhenOption(when: UseWebMCPToolOptions['when']): boolean {
  // Legacy JS callers may still pass a getter; it is evaluated once per render.
  const value = when as boolean | (() => boolean) | undefined
  if (typeof value === 'function') return Boolean(value())
  return value === undefined || value
}
