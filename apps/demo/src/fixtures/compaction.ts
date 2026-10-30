import { createPiRuntime } from '@vampaz/webmcp-kit/pi'

export async function createCompactionFixture(contextWindow?: number) {
  const requests = { summaries: 0, replies: 0 }
  const controller = await createPiRuntime({
    session: {
      namespace: 'compaction-test',
      ownerId: 'fixture',
      conversationId: crypto.randomUUID()
    },
    resolver: {
      name: 'Context capacity fixture',
      available: true,
      status: 'ready',
      detail: 'Deterministic responses',
      capabilities: { conversation: true },
      async getModelLimits() {
        return contextWindow ? { contextWindow, maxOutputTokens: 2048 } : undefined
      },
      async resolve(_message, _tools, _context, options) {
        if (options?.purpose === 'summary') requests.summaries++
        else requests.replies++
        return {
          toolName: 'pi_reply',
          input: { text: 'Page checked.' },
          confidence: 1,
          reason: 'Fixture reply'
        }
      }
    },
    host: {
      async discover() {
        return {
          revision: '1',
          tools: [
            {
              name: 'read_page',
              description: 'Page documentation. '.repeat(2000),
              inputSchema: { type: 'object', properties: {}, additionalProperties: false }
            }
          ]
        }
      },
      async context() {
        return {}
      },
      async invoke() {
        throw new Error('This fixture only replies.')
      }
    }
  })
  return { controller, requests }
}
