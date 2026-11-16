import { getToolAvailability } from './availability'
import { assertValidTool } from './define-tool'
import { isDevelopmentEnvironment } from './environment'
import { emitWebMCPKitEvent } from './events'
import { WebMCPKitError } from './kit-error'
import type {
  RegisteredTool,
  RegisteredTools,
  RegistrySnapshot,
  ToolInvocation,
  ToolInvocationResult,
  WebMCPTool
} from './interfaces/tool'
import { createInvocationId, createInvocationResult, invokeToolPipeline } from './invocation'
import { registerNativeTool } from './native-adapter'
import { getToolWarnings } from './quality'
import { getSupportLabel, isWebMCPSupported } from './support'

const registeredTools = new Map<string, RegisteredTool>()
type NativeRegistrationKind = 'declarative' | 'imperative'

const registryInstance = {}
const registryDuplicateMarker = Symbol.for('@vampaz/webmcp-kit/registry')

interface RegistryDuplicateMarker {
  instance: object
  warned: boolean
}

if (isDevelopmentEnvironment()) {
  const globals = globalThis as Record<PropertyKey, unknown>
  const existing = globals[registryDuplicateMarker]
  if (!existing || typeof existing !== 'object') {
    globals[registryDuplicateMarker] = {
      instance: registryInstance,
      warned: false
    } satisfies RegistryDuplicateMarker
  } else {
    const marker = existing as Partial<RegistryDuplicateMarker>
    // Compare module instances, not module URLs: two copies can share one bundle URL.
    if (marker.instance !== registryInstance && marker.warned !== true) {
      marker.warned = true
      console.warn(
        '[WebMCP Kit] Another copy of @vampaz/webmcp-kit is loaded. Each copy keeps a separate tool registry; deduplicate the package so tools, resolvers, and chat share one registry.'
      )
    }
  }
}

/** Registers one tool and returns its registration handle. */
export function registerTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>
): RegisteredTool<TInput, TOutput> {
  return registerToolWithCleanup(tool)
}

export function registerToolWithCleanup<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>,
  onUnregister?: () => void,
  nativeRegistrationKind: NativeRegistrationKind = 'imperative',
  extraWarnings: readonly string[] = []
): RegisteredTool<TInput, TOutput> {
  assertValidTool(tool)

  if (registeredTools.has(tool.name)) {
    throw new WebMCPKitError(
      'duplicate_tool',
      `Tool "${tool.name}" is already registered. Unregister it before registering another tool with the same name.`
    )
  }

  const nativeRegistration =
    nativeRegistrationKind === 'imperative' ? registerNativeTool(tool) : undefined
  const hasNativeRegistration =
    nativeRegistrationKind === 'declarative' ? isWebMCPSupported() : Boolean(nativeRegistration)
  const warnings = [
    ...getToolWarnings(tool),
    ...(nativeRegistration?.warnings ?? []),
    ...extraWarnings
  ]
  const registeredName = tool.name

  const registration: RegisteredTool<TInput, TOutput> = {
    tool,
    mode: hasNativeRegistration ? 'native-and-fallback' : 'fallback',
    warnings,
    ready: Promise.resolve(),
    unregister() {
      // Stale handles must not remove a newer registration for the same name.
      if (registeredTools.get(registeredName) !== (registration as RegisteredTool)) return

      nativeRegistration?.unregister?.()
      registeredTools.delete(registeredName)
      onUnregister?.()
      emitWebMCPKitEvent({
        type: 'unregistered',
        toolName: registeredName,
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

/** Registers every tool or none; one disposer unregisters the whole set. */
export function registerTools(tools: readonly WebMCPTool[]): RegisteredTools {
  const registrations: RegisteredTool[] = []
  function unregister() {
    for (const registration of registrations.splice(0).reverse()) registration.unregister()
  }
  try {
    for (const tool of tools) registrations.push(registerTool(tool))
  } catch (error) {
    unregister()
    throw error
  }
  return { registrations: [...registrations], unregister }
}

/** Unregisters the named tool and reports whether it was registered. */
export function unregisterTool(name: string): boolean {
  const registration = registeredTools.get(name)
  if (!registration) return false

  registration.unregister()
  return true
}

/** Returns all current registrations, including tools that are temporarily unavailable. */
export function listTools(): RegisteredTool[] {
  return Array.from(registeredTools.values())
}

export function listAvailableTools(): RegisteredTool[] {
  return listTools().filter(function isToolAvailable(registration) {
    return getToolAvailability(registration.tool).available
  })
}

/** Returns the current registration for a tool name, if any. */
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

/** Invokes a registered tool through validation, approval, guards, and execution. Invalid input returns a result instead of rejecting. */
export async function invokeTool<TOutput = unknown>(
  invocation: ToolInvocation
): Promise<ToolInvocationResult<TOutput>> {
  const startedAt = performance.now()
  const invocationId = invocation.id ?? createInvocationId()
  const registration = registeredTools.get(invocation.toolName)

  if (!registration) {
    return createInvocationResult<TOutput>(
      invocation.toolName,
      'error',
      startedAt,
      undefined,
      `Tool "${invocation.toolName}" is not registered.`,
      'not_registered',
      invocationId
    )
  }

  const result = (await invokeToolPipeline(registration.tool, {
    invocationId,
    isCurrent() {
      return registeredTools.get(invocation.toolName) === registration
    },
    input: invocation.input,
    signal: invocation.signal,
    source: invocation.source ?? 'fallback',
    startedAt,
    ...(invocation.requireConfirmation
      ? { requireConfirmation: invocation.requireConfirmation }
      : {})
  })) as ToolInvocationResult<TOutput>
  return result
}

export function clearToolsForTest(): void {
  registeredTools.clear()
}
