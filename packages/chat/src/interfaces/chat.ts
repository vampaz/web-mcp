import type { PiController } from '@vampaz/webmcp-kit/pi'

export interface WebMCPChatOptions {
  harness: PiController
  mode?: 'inline' | 'popup'
  title?: string
  assistantLabel?: string
  placeholder?: string
  emptyState?: string
  suggestedPrompts?: readonly string[]
  disabled?: boolean
}

export interface WebMCPChatElement extends HTMLElement {
  configure(options: WebMCPChatOptions): void
}
