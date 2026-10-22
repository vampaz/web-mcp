import type { Context } from '@earendil-works/chord'
import type { Conversation, ConversationView, Cursor } from '@earendil-works/pi-durable'
import { CompactionEntry } from '@earendil-works/pi-durable'
import type { ToolInvocationResult } from '@vampaz/webmcp-kit'
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

export const piActionInvokingKind = 'webmcp.action.invoking'

export function normalizeMessages(view: Pick<ConversationView, 'entries'>): PiMessage[] {
  const recovered = new Set<ConversationView['entries'][number]['id']>()
  const invoking = new Set<string>()
  const calls = new Map<string, Record<string, unknown>>()
  view.entries.forEach(function scan(entry, index) {
    if (entry.kind === piActionInvokingKind) {
      const callId = (entry.data as { callId?: unknown } | undefined)?.callId
      if (typeof callId === 'string') invoking.add(callId)
    }
    for (const message of entry.model ?? [])
      if (message.role === 'assistant')
        for (const content of message.content)
          if (content.type === 'toolCall' && typeof content.id === 'string')
            calls.set(content.id, content.arguments)
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
      if (message.role === 'toolResult')
        return [
          {
            id: `${entry.id}:${index}`,
            role: 'tool',
            toolName: message.toolName,
            ...(calls.has(message.toolCallId) ? { input: calls.get(message.toolCallId) } : {}),
            ...toolOutcome(text, message.isError, invoking.has(message.toolCallId))
          }
        ]
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
          role: message.role,
          text: text || (message.role === 'assistant' ? (message.errorMessage ?? '') : ''),
          ...(message.role === 'assistant' && message.stopReason === 'error'
            ? { failed: true }
            : {})
        }
      ]
    })
  })
}

function toolOutcome(
  text: string,
  isError: boolean,
  invoked: boolean
): Pick<PiMessage, 'text' | 'status' | 'output' | 'failed'> {
  try {
    const result = JSON.parse(text) as Partial<ToolInvocationResult>
    if (result && typeof result === 'object' && typeof result.status === 'string') {
      const success = result.status === 'success'
      return {
        text: success
          ? (JSON.stringify(result.output) ?? '')
          : (result.error ?? 'The action did not succeed.'),
        status: result.status,
        ...(success && result.output !== undefined ? { output: result.output } : {}),
        failed: !success
      }
    }
  } catch {
    /* Pi wrote a text outcome, such as an interruption or a runtime failure. */
  }
  const plain = text
    .replace(/^<harness>\s*/, '')
    .replace(/\s*<\/harness>$/, '')
    .replace(/^\[error\]\s*/, '')
  if (isError && /\bwas (?:aborted|interrupted|not started)\b/.test(plain))
    // Pi reports any stopped call as aborted; the durable marker says whether the app received it.
    return invoked
      ? {
          text: 'Outcome unknown: the turn stopped after this action started. Check application state before retrying.',
          status: 'unknown',
          failed: true
        }
      : {
          text: 'Not run: the turn stopped before this action started.',
          status: 'error',
          failed: true
        }
  return { text: plain, status: isError ? 'error' : 'success', failed: isError }
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
