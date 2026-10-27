import type { ToolResolution, ToolResolver } from '@vampaz/webmcp-kit'

export function createFixtureResolver(): ToolResolver {
  return {
    name: 'Deterministic test fixture (not model evidence)',
    capabilities: { conversation: true },
    available: true,
    status: 'ready',
    detail: 'Automated test responses. No AI model is connected.',
    async resolve(message, _tools, context, options): Promise<ToolResolution> {
      message = message.split('\n\nCurrent user request: ').at(-1)!.split('\n\n')[0]
      if (message === 'wait')
        await new Promise<void>(function wait(_resolve, reject) {
          options?.signal?.addEventListener(
            'abort',
            function stop() {
              reject(new Error('cancelled'))
            },
            { once: true }
          )
        })
      const history = JSON.stringify(context?.piConversation ?? [])
      if (message === 'fail') throw new Error('Fixture provider failed')
      if (message === 'invalid')
        return { toolName: 'not_a_tool', input: {}, confidence: 1, reason: 'Invalid fixture' }
      if (/set|increment/i.test(message) && !history.includes('"role":"toolResult"'))
        return {
          toolName: 'set_counter',
          input: { value: Number(message.match(/\d+/)?.[0] ?? 1) },
          confidence: 1,
          reason: 'Requested fixture write'
        }
      if (/read/i.test(message) && !history.includes('"role":"toolResult"'))
        return {
          toolName: 'read_counter',
          input: {},
          confidence: 1,
          reason: 'Requested fixture read'
        }
      return {
        toolName: 'pi_reply',
        input: {
          text: '<img src=x onerror=alert(1)> Fixture answer. Counter: ' + context?.counter
        },
        confidence: 1,
        reason: 'Completed fixture turn'
      }
    }
  }
}
