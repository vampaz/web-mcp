import { assertValidTool } from './define-tool'
import { emitWebMCPKitEvent } from './events'
import type { RegisteredTool, ToolInvocation, ToolInvocationResult, WebMCPTool } from './interfaces/tool'
import { registerNativeTool } from './native-adapter'
import { getToolWarnings } from './quality'

const registeredTools = new Map<string, RegisteredTool>()

export function registerTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>
): RegisteredTool<TInput, TOutput> {
  assertValidTool(tool)

  if (registeredTools.has(tool.name)) {
    registeredTools.get(tool.name)?.unregister()
  }

  const unregisterNative = registerNativeTool(tool)
  const warnings = getToolWarnings(tool)

  const registration: RegisteredTool<TInput, TOutput> = {
    tool,
    mode: unregisterNative ? 'native-and-fallback' : 'fallback',
    warnings,
    unregister() {
      unregisterNative?.()
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

export function listTools(): RegisteredTool[] {
  return Array.from(registeredTools.values())
}

export function getTool(name: string): RegisteredTool | undefined {
  return registeredTools.get(name)
}

export async function invokeTool<TOutput = unknown>(
  invocation: ToolInvocation
): Promise<ToolInvocationResult<TOutput>> {
  const startedAt = performance.now()
  const registration = registeredTools.get(invocation.toolName)

  if (!registration) {
    return createResult<TOutput>(
      invocation.toolName,
      'error',
      startedAt,
      undefined,
      `Tool "${invocation.toolName}" is not registered.`
    )
  }

  const availability = registration.tool.scope?.()
  if (availability && !availability.available) {
    const result = createResult<TOutput>(
      invocation.toolName,
      'unavailable',
      startedAt,
      undefined,
      availability.reason ?? 'Tool is not available in the current state.'
    )
    emitWebMCPKitEvent({ type: 'blocked', toolName: invocation.toolName, timestamp: Date.now(), detail: result })
    return result
  }

  if (registration.tool.confirmation?.required && !invocation.confirmed) {
    const result = createResult<TOutput>(
      invocation.toolName,
      'blocked',
      startedAt,
      undefined,
      registration.tool.confirmation.reason
    )
    emitWebMCPKitEvent({ type: 'blocked', toolName: invocation.toolName, timestamp: Date.now(), detail: result })
    return result
  }

  const guardResult = await registration.tool.guard?.(invocation.input)
  if (typeof guardResult === 'string' || guardResult === false) {
    const result = createResult<TOutput>(
      invocation.toolName,
      'blocked',
      startedAt,
      undefined,
      typeof guardResult === 'string' ? guardResult : 'Tool guard blocked invocation.'
    )
    emitWebMCPKitEvent({ type: 'blocked', toolName: invocation.toolName, timestamp: Date.now(), detail: result })
    return result
  }

  emitWebMCPKitEvent({ type: 'invoked', toolName: invocation.toolName, timestamp: Date.now(), detail: invocation })

  try {
    const output = await registration.tool.execute(invocation.input, {
      source: invocation.source ?? 'fallback'
    })
    const result = createResult<TOutput>(invocation.toolName, 'success', startedAt, output as TOutput)
    emitWebMCPKitEvent({ type: 'succeeded', toolName: invocation.toolName, timestamp: Date.now(), detail: result })
    return result
  } catch (error) {
    const result = createResult<TOutput>(
      invocation.toolName,
      'error',
      startedAt,
      undefined,
      error instanceof Error ? error.message : 'Tool invocation failed.'
    )
    emitWebMCPKitEvent({ type: 'failed', toolName: invocation.toolName, timestamp: Date.now(), detail: result })
    return result
  }
}

export function clearToolsForTest(): void {
  registeredTools.clear()
}

function createResult<TOutput>(
  toolName: string,
  status: ToolInvocationResult['status'],
  startedAt: number,
  output?: TOutput,
  error?: string
): ToolInvocationResult<TOutput> {
  return {
    toolName,
    status,
    output,
    error,
    durationMs: Math.round(performance.now() - startedAt)
  }
}
