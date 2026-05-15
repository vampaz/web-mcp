import type { JsonSchema, ToolConfirmation } from './interfaces/tool'

export interface ConfirmationTool {
  name: string
  description: string
  inputSchema: JsonSchema
  confirmation?: ToolConfirmation
}

export type ConfirmationHandler = (
  tool: ConfirmationTool,
  input: unknown,
  reason: string
) => boolean | Promise<boolean>

let confirmationHandler: ConfirmationHandler | undefined
let warnedAboutWindowConfirm = false

export function setConfirmationHandler(handler: ConfirmationHandler | undefined): void {
  confirmationHandler = handler
  warnedAboutWindowConfirm = false
}

export async function requestToolConfirmation(
  tool: ConfirmationTool,
  input: unknown
): Promise<boolean> {
  const reason = tool.confirmation?.reason ?? 'Confirm this action?'

  if (confirmationHandler) {
    return confirmationHandler(tool, input, reason)
  }

  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    warnAboutWindowConfirmFallback()
    return window.confirm(reason)
  }

  return false
}

function warnAboutWindowConfirmFallback(): void {
  if (warnedAboutWindowConfirm || isProduction()) return

  warnedAboutWindowConfirm = true
  console.warn('[WebMCP Kit] No confirmation handler configured; falling back to window.confirm().')
}

function isProduction(): boolean {
  const runtime = globalThis as { process?: { env?: { NODE_ENV?: string } } }

  return runtime.process?.env?.NODE_ENV === 'production'
}
