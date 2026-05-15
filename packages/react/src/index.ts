import { useEffect, useRef } from 'react'

import { registerTool, type RegisteredTool, type WebMCPTool } from '@webmcp-kit/core'

import type { UseWebMCPToolOptions } from './interfaces/webmcp-tool'

export type { ReactWebMCPTool, UseWebMCPToolOptions } from './interfaces/webmcp-tool'

export function useWebMCPTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>,
  options: UseWebMCPToolOptions = {}
): void {
  const registration = useRef<RegisteredTool<TInput, TOutput> | undefined>(undefined)
  const registeredTool = useRef<WebMCPTool<TInput, TOutput> | undefined>(undefined)

  function unregister(): void {
    registration.current?.unregister()
    registration.current = undefined
    registeredTool.current = undefined
  }

  useEffect(function syncWebMCPTool() {
    const available = options.when === undefined || (
      typeof options.when === 'function' ? options.when() : options.when
    )

    if (registration.current && registeredTool.current !== tool) {
      unregister()
    }

    if (available && !registration.current) {
      registration.current = registerTool(tool)
      registeredTool.current = tool
      return
    }

    if (!available) {
      unregister()
    }
  })

  useEffect(function disposeWebMCPTool() {
    return unregister
  }, [])
}
