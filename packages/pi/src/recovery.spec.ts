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
    { id: 'entry:2', role: 'tool', toolName: 'read_counter', text: '7', failed: false },
    { id: 'entry:3', role: 'assistant', text: 'Provider unavailable', failed: true }
  ])
})
