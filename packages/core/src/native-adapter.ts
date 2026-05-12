import type { WebMCPTool } from './interfaces/tool'
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

export function registerNativeTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>
): (() => void) | undefined {
  if (!isWebMCPSupported()) return undefined

  const registerTool = (navigator as NavigatorWithModelContext).modelContext?.registerTool
  if (!registerTool) return undefined

  try {
    const handle = registerTool.call((navigator as NavigatorWithModelContext).modelContext, {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      execute(input: TInput) {
        return tool.execute(input, { source: 'native' })
      }
    }) as NativeHandle | undefined

    return function unregisterNativeTool() {
      if (typeof handle?.unregister === 'function') {
        handle.unregister()
        return
      }

      if (typeof handle?.dispose === 'function') {
        handle.dispose()
      }
    }
  } catch (error) {
    console.warn('[WebMCP Kit] Native registration failed; using fallback registry.', error)
    return undefined
  }
}
