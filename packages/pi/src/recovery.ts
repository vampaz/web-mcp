import type { Context } from '@earendil-works/chord'
import type { Conversation, ConversationView, Cursor } from '@earendil-works/pi-durable'
import { CompactionEntry } from '@earendil-works/pi-durable'
import type { PiMessage } from './interfaces/controller'
import { piRefreshCatalogToolName } from './resolver-adapter'

export function lastTurnState(
  view: Pick<ConversationView, 'entries'>
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

export function normalizeMessages(view: Pick<ConversationView, 'entries'>): PiMessage[] {
  const recovered = new Set<ConversationView['entries'][number]['id']>()
  view.entries.forEach(function overflow(entry, index) {
    if (CompactionEntry.is(entry) && entry.data?.reason === 'overflow') {
      const previous = view.entries[index - 1]
      if (
        previous?.model?.some(
          (message) => message.role === 'assistant' && message.stopReason === 'error'
        )
      )
        recovered.add(previous.id)
    }
  })
  return view.entries.flatMap(function entryMessages(entry) {
    if (entry.kind === 'pi.compaction' || recovered.has(entry.id)) return []
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

export async function readPiHistory(conversation: Conversation, context: Context) {
  const entries: ConversationView['entries'][number][] = []
  let cursor: Cursor | undefined
  do {
    const page = await conversation.entries({ order: 'ascending' }, 100, cursor, context)
    entries.push(...page.items)
    cursor = page.next
  } while (cursor)
  return entries
}
