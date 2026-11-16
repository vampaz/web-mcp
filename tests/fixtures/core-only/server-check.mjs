import assert from 'node:assert/strict'
import { createResolverHandler } from '@vampaz/webmcp-kit/server'

const handler = createResolverHandler({
  provider: 'openai',
  baseUrl: 'https://provider.example/v1',
  apiKey: 'server-owned-key',
  allowedModels: ['model-a'],
  authorize(request) {
    return request.headers.get('x-test-authorize') === 'yes'
  }
})

const originalFetch = globalThis.fetch
globalThis.fetch = async function provider() {
  return Response.json({
    choices: [
      {
        message: {
          content: JSON.stringify({
            toolName: 'read_value',
            input: {},
            confidence: 1,
            reason: 'Read the value.'
          })
        }
      }
    ]
  })
}

try {
  const response = await handler(
    new Request('https://app.example/api/webmcp/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-test-authorize': 'yes'
      },
      body: JSON.stringify({
        provider: 'openai',
        model: 'model-a',
        message: 'Read the value',
        tools: [
          {
            name: 'read_value',
            description: 'Read the visible value.',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false }
          }
        ],
        context: {},
        responseSchema: { type: 'object' }
      })
    })
  )
  assert.equal(response.status, 200)
  assert.equal((await response.json()).toolName, 'read_value')
} finally {
  globalThis.fetch = originalFetch
}
console.log('server passed')
