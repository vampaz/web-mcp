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

  try {
    const handle = registerTool.call((navigator as NavigatorWithModelContext).modelContext, {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      execute(input: TInput) {
        const inputValidationErrors = validateJsonValue(input, tool.inputSchema)
        if (inputValidationErrors.length > 0) {
          throw new Error(formatJsonValueValidationError(inputValidationErrors))
        }

        return tool.execute(input, { source: 'native' })
      }
    }) as NativeHandle | undefined

    return {
      unregister: getNativeUnregister(handle),
      warnings: getNativeHandleWarnings(handle)
    }
  } catch (error) {
    console.warn('[WebMCP Kit] Native registration failed; using fallback registry.', error)
    return undefined
  }
}

function getNativeUnregister(handle: NativeHandle | undefined): (() => void) | undefined {
  if (typeof handle?.unregister === 'function') {
    return function unregisterNativeTool() {
      handle.unregister?.()
    }
  }

  if (typeof handle?.dispose === 'function') {
    return function disposeNativeTool() {
      handle.dispose?.()
    }
  }

  return undefined
}

function getNativeHandleWarnings(handle: NativeHandle | undefined): string[] {
  if (!handle || typeof handle !== 'object') return []

  if (typeof handle.unregister === 'function' || typeof handle.dispose === 'function') return []

  return ['Native WebMCP registration returned a handle without unregister or dispose; local unregister cannot remove the native tool.']
}
