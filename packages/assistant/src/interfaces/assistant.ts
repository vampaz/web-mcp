import type { ConfirmationRequest, ResolverContext, ToolResolver } from '@vampaz/webmcp-kit'
import type { PiController, PiLimits, PiSession } from '@vampaz/webmcp-kit/pi'
import type { WebMCPChatElement, WebMCPChatOptions } from '@vampaz/webmcp-kit/chat'

export interface MountAssistantOptions {
  container: HTMLElement
  session: PiSession
  resolver: ToolResolver
  context?: () => ResolverContext | Promise<ResolverContext>
  limits?: PiLimits
  onCancel?: () => void
  /** Chat options except the controller, which the assistant creates. */
  chat?: Omit<WebMCPChatOptions, 'controller'>
}

export interface MountedAssistant {
  /** Resolves after mounting or a late teardown; rejects after cleanup if initialization fails. */
  ready: Promise<void>
  /**
   * Removes the element and destroys the controller. Waits for pending initialization and
   * any late controller cleanup. Repeated calls return the same promise; cleanup failure rejects it.
   */
  destroy(): Promise<void>
  readonly element: WebMCPChatElement | undefined
  readonly controller: PiController | undefined
}

export interface DialogApproval {
  confirm(request: ConfirmationRequest): Promise<boolean>
  cancel(): void
}
