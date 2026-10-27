import type { WebMCPChatLabels } from './interfaces/chat'

export function createLabels(
  overrides: Partial<WebMCPChatLabels> = {},
  locale?: string
): WebMCPChatLabels {
  const numbers = new Intl.NumberFormat(locale)
  function count(value: number, max: number) {
    return `${numbers.format(value)} / ${numbers.format(max)} characters`
  }
  const defaults: WebMCPChatLabels = {
    user: 'You',
    newChat: 'New chat',
    settings: 'Settings',
    closeSettings: 'Close settings',
    settingsIntro: '',
    conversationModel: 'Conversation model',
    provider: 'Provider',
    model: 'Model',
    confirmations: 'Ask before making changes',
    confirmationsHint: 'Review tools that require approval before they run.',
    send: 'Send',
    stop: 'Stop',
    message: 'Message',
    conversation: 'Conversation',
    working: 'Working…',
    thinking: 'Thinking…',
    compacting: 'Summarizing earlier conversation…',
    hint: 'Enter to send · Shift+Enter for a new line',
    jumpToLatest: 'Jump to latest',
    newMessages: 'New messages · Jump to latest',
    closeChat: 'Close chat',
    moveChat: 'Move chat',
    resizeChat: 'Resize chat',
    moveInstructions: 'Drag to move, or use the arrow keys. Hold Shift for larger steps.',
    resizeInstructions:
      'Cycles sizes. Arrow keys adjust the size; hold Shift for larger steps. You can also drag the lower corner.',
    editLastMessage: 'Edit last message',
    confirmClear: 'Delete this conversation? It cannot be undone.',
    confirmClearAction: 'Delete',
    cancel: 'Cancel',
    tool: 'Tool',
    toolInput: 'Input',
    toolOutput: 'Output',
    toolResult: 'Result',
    responseFailedDetails: 'Response details',
    responseFailedExplanation:
      'This response could not be completed. Check application state before sending a new request.',
    status: {
      loading: 'Loading conversation…',
      interrupted:
        'The previous turn was interrupted. Check application state, then send a new request.',
      error: 'The turn failed. Check the application and try a new request.',
      closed: 'Conversation closed.',
      lastFailed: 'The last response failed. Check application state before sending a new request.',
      newChatStarted: 'New chat started.',
      startingNewChat: 'Starting new chat…'
    },
    openChat(title) {
      return `Open ${title}`
    },
    characterCount: count,
    tooLong(value, max) {
      return `${count(value, max)}. Shorten your message to send it; your full draft is kept.`
    },
    toolFailed(name) {
      return `${name} — failed`
    },
    toolUnknown(name) {
      return `${name} — outcome unknown`
    },
    runningTool(name) {
      return `Running ${name}…`
    },
    awaitingApproval(name) {
      return `Waiting for your approval: ${name}`
    },
    responseFailed(assistantLabel) {
      return `${assistantLabel} — response failed`
    }
  }
  return {
    ...defaults,
    ...overrides,
    status: { ...defaults.status, ...overrides.status }
  }
}
