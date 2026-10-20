import { getToolAvailability } from './availability'
import { assertValidTool } from './define-tool'
import { emitWebMCPKitEvent } from './events'
import type {
  RegisteredTool,
  RegistrySnapshot,
  ToolInvocation,
  ToolInvocationResult,
  WebMCPTool
} from './interfaces/tool'
import { createInvocationResult, invokeToolPipeline } from './invocation'
import { registerNativeTool } from './native-adapter'
import { getToolWarnings } from './quality'
import { getSupportLabel, isWebMCPSupported } from './support'

const registeredTools = new Map<string, RegisteredTool>()
type NativeRegistrationKind = 'declarative' | 'imperative'

export function registerTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>
): RegisteredTool<TInput, TOutput> {
  return registerToolWithCleanup(tool)
}

export function registerToolWithCleanup<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>,
  onUnregister?: () => void,
  nativeRegistrationKind: NativeRegistrationKind = 'imperative'
): RegisteredTool<TInput, TOutput> {
  assertValidTool(tool)

  if (registeredTools.has(tool.name)) {
    throw new Error(
      `Tool "${tool.name}" is already registered. Unregister it before registering another tool with the same name.`
    )
  }

  const nativeRegistration =
    nativeRegistrationKind === 'imperative' ? registerNativeTool(tool) : undefined
  const hasNativeRegistration =
    nativeRegistrationKind === 'declarative' ? isWebMCPSupported() : Boolean(nativeRegistration)
  const warnings = [...getToolWarnings(tool), ...(nativeRegistration?.warnings ?? [])]

  const registration: RegisteredTool<TInput, TOutput> = {
    tool,
    mode: hasNativeRegistration ? 'native-and-fallback' : 'fallback',
    warnings,
    ready: Promise.resolve(),
    unregister() {
      // Stale handles must not remove a newer registration for the same name.
      if (registeredTools.get(tool.name) !== (registration as RegisteredTool)) return

      nativeRegistration?.unregister?.()
      registeredTools.delete(tool.name)
      onUnregister?.()
      emitWebMCPKitEvent({
        type: 'unregistered',
        toolName: tool.name,
        timestamp: Date.now()
      })
    }
  }

  registration.ready = nativeRegistration
    ? nativeRegistration.ready.then(function updateNativeRegistrationMode(registered) {
        if (registered) return
        registration.mode = 'fallback'
        warnings.push('Native WebMCP registration failed; the fallback registry remains active.')
        if (registeredTools.get(tool.name) !== (registration as RegisteredTool)) return
        emitWebMCPKitEvent({
          type: 'registered',
          toolName: tool.name,
          timestamp: Date.now(),
          detail: { mode: registration.mode, warnings }
        })
      })
    : Promise.resolve()

  registeredTools.set(tool.name, registration as RegisteredTool)
  emitWebMCPKitEvent({
    type: 'registered',
    toolName: tool.name,
    timestamp: Date.now(),
    detail: { mode: registration.mode, warnings }
  })

  return registration
}

export function unregisterTool(name: string): boolean {
  const registration = registeredTools.get(name)
  if (!registration) return false

  registration.unregister()
  return true
}

export function listTools(): RegisteredTool[] {
  return Array.from(registeredTools.values())
}

export function listAvailableTools(): RegisteredTool[] {
  return listTools().filter(function isToolAvailable(registration) {
    return getToolAvailability(registration.tool).available
  })
}

export function getTool(name: string): RegisteredTool | undefined {
  return registeredTools.get(name)
}

export function getRegistrySnapshot(): RegistrySnapshot {
  const tools = listTools()

  return {
    supportLabel: getSupportLabel(),
    nativeWebMCP: isWebMCPSupported(),
    toolCount: tools.length,
    tools
  }
}

export async function invokeTool<TOutput = unknown>(
  invocation: ToolInvocation
): Promise<ToolInvocationResult<TOutput>> {
  const startedAt = performance.now()
  const registration = registeredTools.get(invocation.toolName)

  if (!registration) {
    return createInvocationResult<TOutput>(
      invocation.toolName,
      'error',
      startedAt,
      undefined,
      `Tool "${invocation.toolName}" is not registered.`,
      'not_registered'
    )
  }

  const result = (await invokeToolPipeline(registration.tool, {
    invocationId: invocation.id,
    confirmed: invocation.confirmed,
    isCurrent() {
      return registeredTools.get(invocation.toolName) === registration
    },
    input: invocation.input,
    signal: invocation.signal,
    source: invocation.source ?? 'fallback',
    startedAt
  })) as ToolInvocationResult<TOutput>
  return result
}

export function clearToolsForTest(): void {
  registeredTools.clear()
}
