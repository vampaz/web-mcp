import { createScriptedResolver } from '@vampaz/webmcp-kit/testing'
import type { ToolResolution, ToolResolver } from '@vampaz/webmcp-kit'

const markdown = [
  'Here is **bold**, *italic*, and `inline code`.',
  '',
  '- one',
  '- two',
  '',
  '1. first',
  '2. second',
  '',
  'set_counter_value and 2 * 3 * 4 stay literal.',
  '',
  '[safe link](https://example.com/docs) [bad link](javascript:alert(1))',
  '',
  '<img src=x onerror=alert(1)>',
  '',
  '```js',
  'const safe = "<b>code</b>"',
  '```'
].join('\n')

export function createFixtureResolver(): ToolResolver {
  return createScriptedResolver({
    name: 'Deterministic test fixture (not model evidence)',
    detail: 'Automated test responses. No AI model is connected.',
    steps: [
      {
        match(call) {
          return requestText(call.message) === 'wait'
        },
        repeat: true,
        waitForAbort: true
      },
      {
        match(call) {
          return requestText(call.message) === 'markdown'
        },
        resolution: {
          toolName: 'pi_reply',
          input: { text: markdown },
          confidence: 1,
          reason: 'Markdown fixture'
        },
        repeat: true
      },
      {
        match(call) {
          return requestText(call.message) === 'fail'
        },
        error: 'Fixture provider failed',
        repeat: true
      },
      {
        match(call) {
          return requestText(call.message) === 'flaky'
        },
        error: 'Fixture provider failed once'
      },
      {
        match(call) {
          return (
            requestText(call.message) === 'set then fail' &&
            JSON.stringify(call.context.piConversation ?? []).includes('"role":"toolResult"')
          )
        },
        error: 'Fixture provider failed after the write',
        repeat: true
      },
      {
        match(call) {
          return requestText(call.message) === 'set then fail'
        },
        resolution: {
          toolName: 'set_counter',
          input: { value: 6 },
          confidence: 1,
          reason: 'Requested fixture write before a provider failure'
        },
        repeat: true
      },
      {
        match(call) {
          return requestText(call.message) === 'invalid'
        },
        resolution: {
          toolName: 'not_a_tool',
          input: {},
          confidence: 1,
          reason: 'Invalid fixture'
        },
        repeat: true
      }
    ],
    fallback(call): ToolResolution {
      const message = requestText(call.message)
      const history = JSON.stringify(call.context.piConversation ?? [])
      if (/set|increment/i.test(message) && !history.includes('"role":"toolResult"')) {
        return {
          toolName: 'set_counter',
          input: { value: Number(message.match(/\d+/)?.[0] ?? 1) },
          confidence: 1,
          reason: 'Requested fixture write'
        }
      }
      if (/read/i.test(message) && !history.includes('"role":"toolResult"')) {
        return {
          toolName: 'read_counter',
          input: {},
          confidence: 1,
          reason: 'Requested fixture read'
        }
      }
      return {
        toolName: 'pi_reply',
        input: {
          text: '<img src=x onerror=alert(1)> Fixture answer. Counter: ' + call.context.counter
        },
        confidence: 1,
        reason: 'Completed fixture turn'
      }
    }
  })
}

function requestText(message: string): string {
  return message.split('\n\nCurrent user request: ').at(-1)!.split('\n\n')[0]!
}
