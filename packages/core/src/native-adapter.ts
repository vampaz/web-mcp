import { requestToolConfirmation } from './confirmation'
import type { WebMCPTool } from './interfaces/tool'
import { formatJsonValueValidationError, validateJsonValue } from './schema'
import { isWebMCPSupported } from './support'

interface NavigatorWithModelContext extends Navigator {
  modelContext?: {
    registerTool?: (...args: unknown[]) => unknown
  }
}

interface NativeHandle {
  unregister?: () => void
  dispose?: () => void
}

export interface NativeToolRegistration {
  unregister?: () => void
  warnings: string[]
}

export function registerNativeTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>
): NativeToolRegistration | undefined {
  if (!isWebMCPSupported()) return undefined

  const registerTool = (navigator as NavigatorWithModelContext).modelContext?.registerTool
  if (!registerTool) return undefined

  const abortController = typeof AbortController === 'function' ? new AbortController() : undefined

  try {
    const handle = registerTool.call((navigator as NavigatorWithModelContext).modelContext, {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
      async execute(input: TInput) {
        const inputValidationErrors = validateJsonValue(input, tool.inputSchema)
        if (inputValidationErrors.length > 0) {
          throw new Error(formatJsonValueValidationError(inputValidationErrors))
        }

        if (tool.confirmation?.required) {
          const confirmed = await requestToolConfirmation(tool, input)
          if (!confirmed) {
            throw new Error(tool.confirmation.reason)
          }
        }

        return tool.execute(input, { source: 'native' })
      }
    }, abortController ? { signal: abortController.signal } : undefined) as NativeHandle | undefined

    return {
      unregister: getNativeUnregister(handle, abortController),
      warnings: getNativeHandleWarnings(handle, abortController)
    }
  } catch (error) {
    console.warn('[WebMCP Kit] Native registration failed; using fallback registry.', error)
    return undefined
  }
}

function getNativeUnregister(handle: NativeHandle | undefined, abortController: AbortController | undefined): (() => void) | undefined {
  if (typeof handle?.unregister === 'function') {
    return function unregisterNativeTool() {
      handle.unregister?.()
      abortController?.abort()
    }
  }

  if (typeof handle?.dispose === 'function') {
    return function disposeNativeTool() {
      handle.dispose?.()
      abortController?.abort()
    }
  }

  if (abortController) {
    return function abortNativeToolRegistration() {
      abortController.abort()
    }
  }

  return undefined
}

function getNativeHandleWarnings(handle: NativeHandle | undefined, abortController: AbortController | undefined): string[] {
  if (abortController) return []
  if (!handle || typeof handle !== 'object') return []

  if (typeof handle.unregister === 'function' || typeof handle.dispose === 'function') return []

  return ['Native WebMCP registration returned a handle without unregister or dispose; local unregister cannot remove the native tool.']
}
