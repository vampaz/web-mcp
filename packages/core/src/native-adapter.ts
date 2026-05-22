import { requestToolConfirmation } from './confirmation'
import type { WebMCPTool } from './interfaces/tool'
import { formatJsonValueValidationError, validateJsonValue } from './schema'
import { isWebMCPSupported } from './support'

interface NavigatorWithModelContext extends Navigator {
  modelContext?: {
    registerTool?: (...args: unknown[]) => unknown
  }
}

interface NativeRegistrationHandle {
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

  const abortController = new AbortController()

  try {
    const handle = registerTool.call(
      (navigator as NavigatorWithModelContext).modelContext,
      {
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
      },
      { signal: abortController.signal }
    ) as NativeRegistrationHandle | undefined

    return {
      unregister() {
        if (handle?.unregister) {
          handle.unregister()
        } else {
          handle?.dispose?.()
        }
        abortController.abort()
      },
      warnings: []
    }
  } catch (error) {
    console.warn('[WebMCP Kit] Native registration failed; using fallback registry.', error)
    return undefined
  }
}
