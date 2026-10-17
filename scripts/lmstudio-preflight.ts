import { mkdir, writeFile } from 'node:fs/promises'
import { loadEnv } from 'vite'
import { resolveDemoConfig } from '../apps/demo/src/config.ts'

const env = {
  ...loadEnv('development', new URL('../apps/demo/', import.meta.url).pathname, ''),
  ...process.env
}
const config = resolveDemoConfig(env)
if (!config.modelId)
  throw new Error(
    'Set LM_STUDIO_MODEL in apps/demo/.env.local. Start LM Studio and load that exact model, then run npm run test:lmstudio.'
  )
const headers = {
  'Content-Type': 'application/json',
  ...(config.token ? { Authorization: `Bearer ${config.token}` } : {})
}
async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers,
    signal: AbortSignal.timeout(120000),
    redirect: 'error'
  })
  if (!response.ok)
    throw new Error(
      'LM Studio preflight failed. Start the local server, load LM_STUDIO_MODEL, and check the optional server token.'
    )
  return response.json()
}
const models = (await request(new URL('/api/v0/models', config.baseUrl).href)) as {
  data: { id: string; state: string; quantization?: string; loaded_context_length?: number }[]
}
const model = models.data.find(function selected(model) {
  return model.id === config.modelId
})
if (!model || model.state !== 'loaded')
  throw new Error(
    `Load ${config.modelId} in LM Studio before running the model suite. No model substitution is allowed.`
  )
const probe = (await request(config.baseUrl + '/chat/completions', {
  method: 'POST',
  body: JSON.stringify({
    model: config.modelId,
    messages: [{ role: 'user', content: 'Return {"ok":true}.' }],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'preflight',
        strict: true,
        schema: {
          type: 'object',
          properties: { ok: { type: 'boolean', const: true } },
          required: ['ok'],
          additionalProperties: false
        }
      }
    },
    max_tokens: 128,
    reasoning_effort: 'none',
    temperature: 0
  })
})) as { choices?: { message: { content: string } }[] }
if (JSON.parse(probe.choices?.[0]?.message.content ?? '').ok !== true)
  throw new Error(
    'The selected model did not satisfy structured JSON output. Check model support before testing the harness.'
  )
const evidence = {
  recordedAt: new Date().toISOString(),
  lmStudioVersion: env.LM_STUDIO_VERSION?.trim() || 'unreported',
  model: model.id,
  quantization: model.quantization,
  contextLength: model.loaded_context_length,
  structuredOutput: 'passed'
}
await mkdir('test-results', { recursive: true })
await writeFile('test-results/lmstudio-preflight.json', JSON.stringify(evidence, null, 2) + '\n')
console.log(JSON.stringify(evidence, null, 2))
