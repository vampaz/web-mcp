import { isDevelopmentEnvironment } from './environment'
import type { ConfirmationHandler, ConfirmationTool } from './interfaces/tool'

export type { ConfirmationHandler, ConfirmationRequest, ConfirmationTool } from './interfaces/tool'

const handlers = new Map<symbol, ConfirmationHandler>()
let warnedAboutWindowConfirm = false

export function setConfirmationHandler(handler: ConfirmationHandler | undefined): () => void {
  const owner = Symbol('confirmation')
  if (handler) handlers.set(owner, handler)
  else handlers.clear()
  warnedAboutWindowConfirm = false
  return function dispose() {
    handlers.delete(owner)
  }
}

export function hasConfirmationHandler(): boolean {
  return handlers.size > 0
}

export function getConfirmationHandler(): ConfirmationHandler | undefined {
  return Array.from(handlers.values()).at(-1)
}

export async function requestToolConfirmation(
  tool: ConfirmationTool,
  input: unknown,
  signal?: AbortSignal
): Promise<boolean> {
  const reason = tool.confirmation?.reason ?? 'Confirm this action?'
  const handler = tool.confirmation?.handler ?? getConfirmationHandler()

  if (handler) {
    try {
      return await handler({ tool, input, reason, ...(signal ? { signal } : {}) })
    } catch (error) {
      throw new Error(`Confirmation handler failed: ${getErrorMessage(error)}`)
    }
  }

  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    warnAboutWindowConfirmFallback()
    try {
      return window.confirm(reason)
    } catch (error) {
      throw new Error(`Confirmation handler failed: ${getErrorMessage(error)}`)
    }
  }

  return false
}

function warnAboutWindowConfirmFallback(): void {
  if (warnedAboutWindowConfirm || !isDevelopmentEnvironment()) return

  warnedAboutWindowConfirm = true
  console.warn('[WebMCP Kit] No confirmation handler configured; falling back to window.confirm().')
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error'
}
