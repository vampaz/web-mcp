import type { WebMCPTool } from './interfaces/tool'
import { invokeToolPipeline } from './invocation'
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
          const result = await invokeToolPipeline(tool, {
            input,
            source: 'native'
          })
          if (result.status !== 'success') {
            throw new Error(result.error ?? `Tool invocation ${result.status}.`)
          }

          return result.output
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
