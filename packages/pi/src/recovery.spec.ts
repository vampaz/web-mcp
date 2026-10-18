import { expect, it } from 'vitest'
import type { ConversationView } from '@earendil-works/pi-durable'
import { lastTurnState, normalizeMessages } from './recovery'

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
