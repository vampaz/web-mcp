import type { ConversationView } from '@earendil-works/pi-durable'
import type { PiMessage } from './interfaces/controller'
import { piRefreshCatalogToolName } from './resolver-adapter'

export function lastTurnState(
  view: ConversationView
): 'started' | 'interrupted' | 'finished' | undefined {
  const marker = [...view.entries].reverse().find(function turn(entry) {
    return entry.kind.startsWith('webmcp.turn.')
  })
  switch (marker?.kind) {
    case 'webmcp.turn.started':
      return 'started'
    case 'webmcp.turn.interrupted':
      return 'interrupted'
    case 'webmcp.turn.finished':
      return 'finished'
    default:
      return undefined
  }
}

export function normalizeMessages(view: ConversationView): PiMessage[] {
  return view.entries.flatMap(function entryMessages(entry) {
    return (entry.model ?? []).flatMap(function normalize(message, index): PiMessage[] {
      if (message.role === 'system') return []
      if (message.role === 'toolResult' && message.toolName === piRefreshCatalogToolName) return []
      const text =
        typeof message.content === 'string'
          ? message.content
          : message.content
              .flatMap(function text(block) {
                return block.type === 'text' ? [block.text] : []
              })
              .join('\n')
      if (
        !text &&
        message.role === 'assistant' &&
        !message.errorMessage &&
        message.stopReason !== 'error'
      )
        return []
      return [
        {
          id: `${entry.id}:${index}`,
          role: message.role === 'toolResult' ? 'tool' : message.role,
          text: text || (message.role === 'assistant' ? (message.errorMessage ?? '') : ''),
          ...(message.role === 'toolResult'
            ? { toolName: message.toolName, failed: message.isError }
            : {}),
          ...(message.role === 'assistant' && message.stopReason === 'error'
            ? { failed: true }
            : {})
        }
      ]
    })
  })
}
