import { assertValidTool } from './define-tool'
import { isDevelopmentEnvironment } from './environment'
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

export function registerTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>
): RegisteredTool<TInput, TOutput> {
  assertValidTool(tool)

  if (registeredTools.has(tool.name)) {
    warnAboutDuplicateRegistration(tool.name)
    registeredTools.get(tool.name)?.unregister()
  }

  const nativeRegistration = registerNativeTool(tool)
  const warnings = [...getToolWarnings(tool), ...(nativeRegistration?.warnings ?? [])]

  const registration: RegisteredTool<TInput, TOutput> = {
    tool,
    mode: nativeRegistration ? 'native-and-fallback' : 'fallback',
    warnings,
    unregister() {
      // Stale handles must not remove a newer registration for the same name.
      if (registeredTools.get(tool.name) !== (registration as RegisteredTool)) return

      nativeRegistration?.unregister?.()
      registeredTools.delete(tool.name)
      emitWebMCPKitEvent({
        type: 'unregistered',
        toolName: tool.name,
        timestamp: Date.now()
      })
    }
  }

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

  const invocationId = invocation.id ?? createInvocationId()
  const trackedInvocation = {
    ...invocation,
    id: invocationId
  }

  emitWebMCPKitEvent({
    type: 'invoked',
    toolName: invocation.toolName,
    timestamp: Date.now(),
    detail: trackedInvocation
  })

  const result = (await invokeToolPipeline(registration.tool, {
    confirmed: invocation.confirmed,
    input: invocation.input,
    source: invocation.source ?? 'fallback',
    startedAt
  })) as ToolInvocationResult<TOutput>
  result.invocationId = invocationId
  emitWebMCPKitEvent({
    type:
      result.status === 'success'
        ? 'succeeded'
        : result.status === 'blocked' || result.status === 'unavailable'
          ? 'blocked'
          : 'failed',
    toolName: invocation.toolName,
    timestamp: Date.now(),
    detail: result
  })
  return result
}

export function clearToolsForTest(): void {
  registeredTools.clear()
}

function createInvocationId(): string {
  return `invocation_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function warnAboutDuplicateRegistration(toolName: string): void {
  if (!isDevelopmentEnvironment()) return

  console.warn(
    `[WebMCP Kit] Tool "${toolName}" was already registered; replacing the previous registration. Call unregisterTool("${toolName}") first to silence this warning.`
  )
}
