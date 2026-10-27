import type { PiController, PiMessage } from '@vampaz/webmcp-kit/pi'
import type { WebMCPChatSettings } from './settings'

export interface WebMCPChatStatusLabels {
  loading: string
  interrupted: string
  error: string
  closed: string
  lastFailed: string
  newChatStarted: string
  startingNewChat: string
}

export interface WebMCPChatLabels {
  user: string
  newChat: string
  settings: string
  closeSettings: string
  settingsIntro: string
  conversationModel: string
  provider: string
  model: string
  confirmations: string
  confirmationsHint: string
  send: string
  stop: string
  message: string
  conversation: string
  working: string
  thinking: string
  compacting: string
  hint: string
  jumpToLatest: string
  newMessages: string
  closeChat: string
  moveChat: string
  resizeChat: string
  moveInstructions: string
  resizeInstructions: string
  editLastMessage: string
  /** @deprecated Unused; New chat starts immediately without confirmation. */
  confirmClear: string
  /** @deprecated Unused; New chat starts immediately without confirmation. */
  confirmClearAction: string
  /** @deprecated Unused; New chat starts immediately without confirmation. */
  cancel: string
  tool: string
  toolInput: string
  toolOutput: string
  toolResult: string
  responseFailedDetails: string
  responseFailedExplanation: string
  status: WebMCPChatStatusLabels
  openChat(title: string): string
  characterCount(count: number, max: number): string
  tooLong(count: number, max: number): string
  toolFailed(name: string): string
  toolUnknown(name: string): string
  runningTool(name: string): string
  awaitingApproval(name: string): string
  responseFailed(assistantLabel: string): string
}

export interface WebMCPChatOptions {
  controller: PiController
  mode?: 'inline' | 'popup'
  /** Popup launcher side in the inline direction; defaults to `end`. */
  placement?: 'end' | 'start'
  /** Defaults to `light`; `auto` follows the user's color scheme. */
  theme?: 'auto' | 'light' | 'dark'
  title?: string
  assistantLabel?: string
  placeholder?: string
  emptyState?: string
  suggestedPrompts?: readonly string[]
  disabled?: boolean
  /** Optional provider, model and approval controls. The application owns their behavior. */
  settings?: WebMCPChatSettings
  labels?: Partial<WebMCPChatLabels>
  /** Locale for number formatting in the default labels. */
  locale?: string
  /** Characters per message; defaults to 16,000. */
  maxMessageLength?: number
  /**
   * Renders a user or assistant message body into `target` when its text changes.
   * Return `true` to skip the default plain-text rendering.
   * Message text is untrusted user and model output: sanitize anything inserted as HTML.
   */
  renderMessage?: (message: PiMessage, target: HTMLElement) => boolean | void
}

export interface WebMCPChatElement extends HTMLElement {
  configure(options: WebMCPChatOptions): void
  get controller(): PiController | undefined
  set controller(controller: PiController)
  open(): void
  close(): void
  toggle(): void
  focusComposer(): void
  setDraft(text: string): void
}

export interface ChatStatus {
  text: string
  tone?: 'error'
}
