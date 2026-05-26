import { useEffect, useRef } from 'react'

import { registerTool, type RegisteredTool, type WebMCPTool } from 'webmcp-kit'

import type { UseWebMCPToolOptions } from './interfaces/webmcp-tool'

export type { ReactWebMCPTool, UseWebMCPToolOptions } from './interfaces/webmcp-tool'

export function useWebMCPTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>,
  options: UseWebMCPToolOptions = {}
): void {
  const registration = useRef<RegisteredTool<TInput, TOutput> | undefined>(undefined)
  const registeredTool = useRef<WebMCPTool<TInput, TOutput> | undefined>(undefined)
  const whenValue = typeof options.when === 'function' ? options.when() : options.when

  useEffect(
    function syncWebMCPTool() {
      const available = whenValue === undefined || whenValue

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
    [tool, whenValue]
  )
}
