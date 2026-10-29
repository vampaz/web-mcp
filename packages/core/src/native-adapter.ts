import type { WebMCPTool } from './interfaces/tool'
import { invokeToolPipeline } from './invocation'
import { getWebMCPModelContext } from './support'

interface NativeRegistrationHandle {
  unregister?: () => void
  dispose?: () => void
}

export interface NativeToolRegistration {
  ready: Promise<boolean>
  unregister?: () => void
  warnings: string[]
}

export function registerNativeTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>
): NativeToolRegistration | undefined {
  const modelContext = getWebMCPModelContext()
  const registerTool = modelContext?.registerTool
  if (!registerTool) return undefined

  const abortController = new AbortController()
  let active = true

  try {
    const returnedHandle = registerTool.call(
      modelContext,
      {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema
          ? {
              anyOf: [
                tool.outputSchema,
                {
                  type: 'object',
                  properties: { isError: { const: true } },
                  required: ['isError', 'status', 'code', 'error']
                }
              ]
            }
          : undefined,
        annotations: tool.annotations,
        async execute(input: TInput, options?: { signal?: AbortSignal }) {
          const result = await invokeToolPipeline(tool, {
            input,
            signal: options?.signal,
            isCurrent() {
              return active
            },
            source: 'native'
          })
          if (result.status !== 'success') {
            return { ...result, isError: true }
          }

          return result.output
        }
      },
      { signal: abortController.signal }
    ) as NativeRegistrationHandle | Promise<NativeRegistrationHandle | undefined> | undefined
    let handle = isPromiseLike(returnedHandle) ? undefined : returnedHandle
    const ready = isPromiseLike(returnedHandle)
      ? Promise.resolve(returnedHandle)
          .then(function storeNativeHandle(resolvedHandle) {
            handle = resolvedHandle
            if (!active) unregisterNativeHandle(handle)
            return true
          })
          .catch(function handleNativeRegistrationFailure(error) {
            if (!active) return false
            console.warn('[WebMCP Kit] Native registration failed; using fallback registry.', error)
            return false
          })
      : Promise.resolve(true)

    return {
      ready,
      unregister() {
        active = false
        unregisterNativeHandle(handle)
        abortController.abort()
      },
      warnings: []
    }
  } catch (error) {
    console.warn('[WebMCP Kit] Native registration failed; using fallback registry.', error)
    return undefined
  }
}

function unregisterNativeHandle(handle: NativeRegistrationHandle | undefined): void {
  if (handle?.unregister) {
    handle.unregister()
  } else {
    handle?.dispose?.()
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<NativeRegistrationHandle | undefined> {
  return Boolean(value && typeof (value as PromiseLike<unknown>).then === 'function')
}
