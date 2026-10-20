import { useEffect, useRef } from 'react'

import { registerTool, type RegisteredTool, type WebMCPTool } from '@vampaz/webmcp-kit'

import type { UseWebMCPToolOptions, UseWebMCPToolResult } from './interfaces/webmcp-tool'

export type { UseWebMCPToolOptions, UseWebMCPToolResult } from './interfaces/webmcp-tool'

export function useWebMCPTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>,
  options: UseWebMCPToolOptions = {}
): UseWebMCPToolResult<TInput, TOutput> {
  const currentTool = useRef(tool)
  const registration = useRef<RegisteredTool<TInput, TOutput> | undefined>(undefined)
  const handle = useRef<UseWebMCPToolResult<TInput, TOutput> | undefined>(undefined)
  const available = options.when === undefined || options.when === true
  const definition = JSON.stringify({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    annotations: tool.annotations,
    examples: tool.examples,
    confirmation: tool.confirmation?.reason,
    hasConfirmation: Boolean(tool.confirmation),
    hasConfirmationHandler: Boolean(tool.confirmation?.handler),
    hasParser: Boolean(tool.parseInput)
  })

  // Only committed renders may update callbacks used by an in-flight invocation.
  useEffect(function updateCallbacks() {
    currentTool.current = tool
  })

  useEffect(
    function syncWebMCPTool() {
      if (!available) return

      registration.current = registerTool({
        ...currentTool.current,
        scope() {
          return currentTool.current.scope?.() ?? { available: true }
        },
        guard(input) {
          return currentTool.current.guard?.(input) ?? true
        },
        ...(currentTool.current.parseInput
          ? {
              parseInput(input: unknown) {
                return currentTool.current.parseInput!(input)
              }
            }
          : {}),
        ...(currentTool.current.confirmation?.handler
          ? {
              confirmation: {
                reason: currentTool.current.confirmation.reason,
                handler(request) {
                  return currentTool.current.confirmation!.handler!(request)
                }
              }
            }
          : {}),
        execute(input, context) {
          return currentTool.current.execute(input, context)
        }
      })

      return function disposeWebMCPTool() {
        registration.current?.unregister()
        registration.current = undefined
      }
    },
    [definition, available]
  )

  if (!handle.current) {
    handle.current = {
      unregister() {
        registration.current?.unregister()
        registration.current = undefined
      },
      getRegistration() {
        return registration.current
      }
    }
  }

  return handle.current
}
