import { expect, it, vi } from 'vitest'
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import type { Conversation, ConversationView } from '@earendil-works/pi-durable'
import { lastTurnState, normalizeMessages, readPiHistory } from './recovery'

it('reads every page of durable history in chronological order without exposing compaction checkpoints', async function history() {
  const entries = vi
    .fn()
    .mockResolvedValueOnce({
      items: [{ id: 1, kind: 'user', model: [{ role: 'user', content: 'Original request' }] }],
      next: { after: 1 }
    })
    .mockResolvedValueOnce({
      items: [
        {
          id: 2,
          kind: 'pi.compaction',
          model: [{ role: 'user', content: '<summary>Internal checkpoint</summary>' }]
        },
        {
          id: 3,
          kind: 'assistant',
          model: [{ role: 'assistant', content: [{ type: 'text', text: 'Saved' }] }]
        }
      ]
    })
  const history = await readPiHistory({ entries } as unknown as Conversation, BACKGROUND_CONTEXT)
  expect(entries).toHaveBeenNthCalledWith(
    2,
    { order: 'ascending' },
    100,
    { after: 1 },
    BACKGROUND_CONTEXT
  )
  expect(
    normalizeMessages({ entries: history }).map(function text(message) {
      return message.text
    })
  ).toEqual(['Original request', 'Saved'])
})

it('preserves the latest durable turn state across unrelated entries', function test() {
  const entries: ConversationView['entries'][number][] = []
  const view = { entries } as unknown as ConversationView
  expect(lastTurnState(view)).toBeUndefined()
  for (const state of ['started', 'interrupted', 'started', 'finished'] as const) {
    entries.push({ kind: `webmcp.turn.${state}` } as ConversationView['entries'][number])
    entries.push({ kind: 'conversation.message' } as ConversationView['entries'][number])
    expect(lastTurnState(view)).toBe(state)
  }
})

it('keeps assistant prose, tool results, and failures without displaying raw action requests', function test() {
  const view = {
    entries: [
      {
        id: 'entry',
        model: [
          {
            role: 'assistant',
            content: [{ type: 'toolCall', name: 'read_counter', arguments: {} }]
          },
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Checking the counter.' },
              { type: 'toolCall', name: 'read_counter', arguments: { value: 7 } }
            ]
          },
          {
            role: 'toolResult',
            toolName: 'read_counter',
            content: [{ type: 'text', text: '7' }],
            isError: false
          },
          {
            role: 'assistant',
            content: [],
            stopReason: 'error',
            errorMessage: 'Provider unavailable'
          }
        ]
      }
    ]
  } as unknown as ConversationView
  expect(normalizeMessages(view)).toEqual([
    { id: 'entry:1', role: 'assistant', text: 'Checking the counter.' },
    {
      id: 'entry:2',
      role: 'tool',
      toolName: 'read_counter',
      text: '7',
      status: 'success',
      failed: false
    },
    { id: 'entry:3', role: 'assistant', text: 'Provider unavailable', failed: true }
  ])
})

it('shows structured outcomes and marks interrupted invoked actions as unknown', () => {
  const view = {
    entries: [
      {
        id: 'a',
        kind: 'pi.assistant',
        model: [
          {
            role: 'assistant',
            content: [
              { type: 'toolCall', id: 'call-1', name: 'set_counter', arguments: { value: 3 } }
            ]
          }
        ]
      },
      {
        id: 'b',
        kind: 'webmcp.action.invoking',
        data: { callId: 'call-1', toolName: 'set_counter' }
      },
      {
        id: 'c',
        kind: 'pi.tool',
        model: [
          {
            role: 'toolResult',
            toolCallId: 'call-1',
            toolName: 'set_counter',
            isError: true,
            content: [
              { type: 'text', text: '<harness>\n[error] Tool set_counter was aborted\n</harness>' }
            ]
          }
        ]
      },
      {
        id: 'd',
        kind: 'pi.assistant',
        model: [
          {
            role: 'assistant',
            content: [{ type: 'toolCall', id: 'call-2', name: 'read_counter', arguments: {} }]
          }
        ]
      },
      {
        id: 'e',
        kind: 'pi.tool',
        model: [
          {
            role: 'toolResult',
            toolCallId: 'call-2',
            toolName: 'read_counter',
            isError: false,
            content: [{ type: 'text', text: '{"status":"success","output":{"value":3}}' }]
          },
          {
            role: 'toolResult',
            toolCallId: 'call-3',
            toolName: 'clear_counter',
            isError: true,
            content: [
              {
                type: 'text',
                text: '<harness>\n[error] Tool clear_counter was aborted\n</harness>'
              }
            ]
          }
        ]
      }
    ]
  } as unknown as ConversationView

  expect(normalizeMessages(view).filter((message) => message.role === 'tool')).toEqual([
    {
      id: 'c:0',
      role: 'tool',
      toolName: 'set_counter',
      input: { value: 3 },
      text: 'Outcome unknown: the turn stopped after this action started. Check application state before retrying.',
      status: 'unknown',
      failed: true
    },
    {
      id: 'e:0',
      role: 'tool',
      toolName: 'read_counter',
      input: {},
      text: '{"value":3}',
      status: 'success',
      output: { value: 3 },
      failed: false
    },
    {
      id: 'e:1',
      role: 'tool',
      toolName: 'clear_counter',
      text: 'Not run: the turn stopped before this action started.',
      status: 'error',
      failed: true
    }
  ])
})
