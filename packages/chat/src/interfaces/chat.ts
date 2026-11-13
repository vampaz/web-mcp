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
  /** @deprecated Unused; settings show labeled controls without an introduction. */
  settingsIntro: string
  /** @deprecated Unused; models are chosen from the composer model picker. */
  conversationModel: string
  /** @deprecated Unused; models are chosen from the composer model picker. */
  provider: string
  /** Accessible name of the model list. */
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
  /** Copy button under assistant replies. */
  copyReply: string
  copied: string
  copyFailed: string
  /** Visible outcome beside a failed tool call. */
  toolStatusFailed: string
  /** Visible outcome beside a tool call whose result is unknown. */
  toolStatusUnknown: string
  searchModels: string
  noModelsMatch: string
  status: WebMCPChatStatusLabels
  openChat(title: string): string
  /** Heading of a block of consecutive tool calls. */
  toolsUsed(count: number): string
  /** Accessible name of the composer model button; must contain the visible model label. */
  chooseModel(model: string): string
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
  /** Opens the settings view. No effect without `settings`. */
  openSettings(): void
  /** Opens the composer model picker. No effect without `settings`. */
  openModelPicker(): void
}

export interface ChatStatus {
  text: string
  tone?: 'error'
}
