import { isDevelopmentEnvironment } from './environment'
import type { ConfirmationHandler, ConfirmationTool } from './interfaces/tool'

export type { ConfirmationHandler, ConfirmationTool } from './interfaces/tool'

let confirmationHandler: ConfirmationHandler | undefined
let warnedAboutWindowConfirm = false

export function setConfirmationHandler(handler: ConfirmationHandler | undefined): void {
  confirmationHandler = handler
  warnedAboutWindowConfirm = false
}

export function hasConfirmationHandler(): boolean {
  return confirmationHandler !== undefined
}

export function getConfirmationHandler(): ConfirmationHandler | undefined {
  return confirmationHandler
}

export async function requestToolConfirmation(
  tool: ConfirmationTool,
  input: unknown
): Promise<boolean> {
  const reason = tool.confirmation?.reason ?? 'Confirm this action?'
  const handler = tool.confirmation?.handler ?? confirmationHandler

  if (handler) {
    try {
      return await handler(tool, input, reason)
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
