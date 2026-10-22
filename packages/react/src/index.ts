import { useEffect, useRef } from 'react'

import {
  registerTool,
  registerTools,
  type RegisteredTool,
  type RegisteredTools,
  type WebMCPTool
} from '@vampaz/webmcp-kit'

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
  const currentTool = useRef(tool)
  const registration = useRef<RegisteredTool<TInput, TOutput> | undefined>(undefined)
  const handle = useRef<UseWebMCPToolResult<TInput, TOutput> | undefined>(undefined)
  const available = options.when === undefined || options.when === true
  const definition = JSON.stringify(getToolDefinition(tool))

  // Only committed renders may update callbacks used by an in-flight invocation.
  useEffect(function updateCallbacks() {
    currentTool.current = tool
  })

  useEffect(
    function syncWebMCPTool() {
      if (!available) return

      registration.current = registerTool(
        createCommittedTool(function getCommittedTool() {
          return currentTool.current
        })
      )

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

/** Registers the tools as one atomic set with the same stability rules as `useWebMCPTool`. */
export function useWebMCPTools(
  tools: readonly WebMCPTool[],
  options: UseWebMCPToolOptions = {}
): UseWebMCPToolsResult {
  const currentTools = useRef(tools)
  const registered = useRef<RegisteredTools | undefined>(undefined)
  const handle = useRef<UseWebMCPToolsResult | undefined>(undefined)
  const available = options.when === undefined || options.when === true
  const definition = JSON.stringify(tools.map(getToolDefinition))

  // Only committed renders may update callbacks used by an in-flight invocation.
  useEffect(function updateCallbacks() {
    currentTools.current = tools
  })

  useEffect(
    function syncWebMCPTools() {
      if (!available) return

      // An unchanged definition keeps every tool name at the same index.
      registered.current = registerTools(
        currentTools.current.map(function createTool(_tool, index) {
          return createCommittedTool(function getCommittedTool() {
            return currentTools.current[index]
          })
        })
      )

      return function disposeWebMCPTools() {
        registered.current?.unregister()
        registered.current = undefined
      }
    },
    [definition, available]
  )

  if (!handle.current) {
    handle.current = {
      unregister() {
        registered.current?.unregister()
        registered.current = undefined
      },
      getRegistrations() {
        return registered.current?.registrations ?? []
      }
    }
  }

  return handle.current
}

function getToolDefinition<TInput, TOutput>(tool: WebMCPTool<TInput, TOutput>) {
  return {
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
  }
}

function createCommittedTool<TInput, TOutput>(
  getTool: () => WebMCPTool<TInput, TOutput>
): WebMCPTool<TInput, TOutput> {
  const tool = getTool()

  return {
    ...tool,
    scope() {
      return getTool().scope?.() ?? { available: true }
    },
    guard(input) {
      return getTool().guard?.(input) ?? true
    },
    ...(tool.parseInput
      ? {
          parseInput(input: unknown) {
            return getTool().parseInput!(input)
          }
        }
      : {}),
    ...(tool.confirmation?.handler
      ? {
          confirmation: {
            reason: tool.confirmation.reason,
            handler(request) {
              return getTool().confirmation!.handler!(request)
            }
          }
        }
      : {}),
    execute(input, context) {
      return getTool().execute(input, context)
    }
  }
}
