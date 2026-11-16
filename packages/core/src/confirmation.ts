import { isDevelopmentEnvironment } from './environment'
import type { ConfirmationHandler, ConfirmationTool, ToolContext } from './interfaces/tool'

export type { ConfirmationHandler, ConfirmationRequest, ConfirmationTool } from './interfaces/tool'

const handlers = new Map<symbol, ConfirmationHandler>()
let warnedAboutWindowConfirm = false

/** Installs the application approval handler and returns a disposer. Passing undefined clears installed handlers. */
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
  options: ToolConfirmationOptions = {}
): Promise<boolean> {
  const reason = options.reason ?? tool.confirmation?.reason ?? 'Confirm this action?'
  const handler = tool.confirmation?.handler ?? getConfirmationHandler()

  if (handler) {
    try {
      // Only an explicit true approves; dialog return values such as 'cancel' must not.
      return (
        (await handler({
          tool,
          input,
          reason,
          ...(options.signal ? { signal: options.signal } : {}),
          ...(options.source ? { source: options.source } : {}),
          ...(options.invocationId === undefined ? {} : { invocationId: options.invocationId }),
          ...(options.callerRequired === undefined
            ? {}
            : { callerRequired: options.callerRequired })
        })) === true
      )
    } catch (error) {
      throw new Error(`Confirmation handler failed: ${getErrorMessage(error)}`)
    }
  }

  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    warnAboutWindowConfirmFallback()
    try {
      return window.confirm(formatConfirmationPrompt(reason, tool.name, input))
    } catch (error) {
      throw new Error(`Confirmation handler failed: ${getErrorMessage(error)}`)
    }
  }

  return false
}

export interface ToolConfirmationOptions {
  signal?: AbortSignal
  source?: ToolContext['source']
  invocationId?: string
  reason?: string
  callerRequired?: boolean
}

const maxConfirmationDetailLength = 500

function formatConfirmationPrompt(reason: string, toolName: string, input: unknown): string {
  const detail = `${toolName}\n${summarizeConfirmationInput(input)}`
  const bounded =
    detail.length > maxConfirmationDetailLength
      ? `${detail.slice(0, maxConfirmationDetailLength - 1)}…`
      : detail
  return `${reason}\n\n${bounded}`
}

function summarizeConfirmationInput(input: unknown): string {
  try {
    return JSON.stringify(input) ?? String(input)
  } catch {
    return '[unserializable input]'
  }
}

function warnAboutWindowConfirmFallback(): void {
  if (warnedAboutWindowConfirm || !isDevelopmentEnvironment()) return

  warnedAboutWindowConfirm = true
  console.warn('[WebMCP Kit] No confirmation handler configured; falling back to window.confirm().')
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error'
}
