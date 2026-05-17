import type { APIRoute } from 'astro'

import type { CloudflareEnv } from '@/interfaces/cloudflare'

type CloudflareAiInput = {
  messages: Array<{
    role: 'system' | 'user'
    content: string
  }>
  response_format?: {
    type: 'json_object'
  }
  temperature: number
}

type CloudflareAiResult = {
  response?: string
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

type PlannerRequestBody = {
  provider?: string
  model?: string
  message?: string
  tools?: Array<{
    name?: string
    description?: string
    inputSchema?: unknown
  }>
  context?: unknown
}

type ToolPlan = {
  toolName: string
  input: Record<string, unknown>
  confidence: number
  reason: string
}

const allowedCloudflareModels = new Set([
  '@cf/google/gemma-4-26b-a4b-it',
  '@cf/moonshotai/kimi-k2.6',
  '@cf/zai-org/glm-4.7-flash',
  '@cf/qwen/qwen3-30b-a3b-fp8',
  '@cf/openai/gpt-oss-20b',
  '@cf/meta/llama-3.2-3b-instruct',
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
  '@cf/meta/llama-3.1-8b-instruct',
  '@cf/qwen/qwq-32b'
])

export const prerender = false

export const POST: APIRoute = async function planWithServerProvider({ request, locals }) {
  const body = await readPlannerRequest(request)
  if (!body.model || !allowedCloudflareModels.has(body.model)) return json({ error: 'Unsupported Cloudflare model' }, 400)
  if (!body.message || !Array.isArray(body.tools)) return json({ error: 'Invalid planner request' }, 400)
  const env = await getCloudflareEnv(locals)

  try {
    if (body.provider === 'cloudflare-binding') {
      return json(await planWithCloudflareBinding(body, env))
    }

    if (body.provider === 'cloudflare-workers-ai') {
      return json(await planWithCloudflareRest(body, env))
    }
  } catch (error) {
    return json({ error: getErrorMessage(error) }, 502)
  }

  return json({ error: 'Unsupported server planner provider' }, 400)
}

export const OPTIONS: APIRoute = function handleOptions() {
  return new Response(null, {
    headers: getJsonHeaders()
  })
}

async function planWithCloudflareBinding(body: PlannerRequestBody, env: CloudflareEnv): Promise<ToolPlan> {
  if (!env.AI) {
    throw new Error('Cloudflare AI binding is unavailable in this runtime. Restart dev with the Astro Cloudflare adapter and remote bindings enabled, or use a Cloudflare preview deployment.')
  }

  const result = await env.AI.run(body.model ?? '', {
    messages: createPlannerMessages(body),
    response_format: {
      type: 'json_object'
    },
    temperature: 0
  } as never) as CloudflareAiResult

  return parseAndValidatePlan(extractResponseText(result), body.tools)
}

async function planWithCloudflareRest(body: PlannerRequestBody, env: CloudflareEnv): Promise<ToolPlan> {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID ?? import.meta.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = env.CLOUDFLARE_API_TOKEN ?? import.meta.env.CLOUDFLARE_API_TOKEN
  if (!accountId || !apiToken) {
    throw new Error('Cloudflare Workers AI server mode needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN on the server, or a custom planner endpoint.')
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${body.model}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages: createPlannerMessages(body),
      response_format: {
        type: 'json_object'
      },
      temperature: 0
    })
  })

  if (!response.ok) throw new Error(`Cloudflare Workers AI returned ${response.status}`)

  const payload = await response.json() as { result?: { response?: string } }
  return parseAndValidatePlan(payload.result?.response?.trim(), body.tools)
}

async function readPlannerRequest(request: Request): Promise<PlannerRequestBody> {
  try {
    return await request.json() as PlannerRequestBody
  } catch {
    return {}
  }
}

function createPlannerMessages(body: PlannerRequestBody): CloudflareAiInput['messages'] {
  return [
    {
      role: 'system',
      content: 'Choose exactly one WebMCP tool. Return only one raw JSON object with toolName, input, confidence, and reason. Do not return Markdown, HTML, prose, or a code fence.'
    },
    {
      role: 'user',
      content: [
        `User request: ${body.message}`,
        `Current app context:\n${JSON.stringify(body.context ?? {}, null, 2)}`,
        `Available tools:\n${JSON.stringify(body.tools ?? [], null, 2)}`,
        'Use stable IDs from context when selecting existing items.',
        'Expected shape: {"toolName":"tool_name","input":{"id":"stable_id_from_context"},"confidence":0.9,"reason":"Brief reason for the selected tool."}'
      ].join('\n\n')
    }
  ]
}

function parseAndValidatePlan(response: string | undefined, tools: PlannerRequestBody['tools']): ToolPlan {
  if (!response) throw new Error('Cloudflare returned no response')

  const plan = JSON.parse(normalizeJsonText(response)) as ToolPlan
  validatePlan(plan, tools)

  return plan
}

function extractResponseText(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim()

  if (value && typeof value === 'object' && 'response' in value && typeof value.response === 'string') {
    return value.response.trim()
  }

  if (value && typeof value === 'object' && 'choices' in value && Array.isArray(value.choices)) {
    const content = value.choices[0]?.message?.content
    return typeof content === 'string' ? content.trim() : undefined
  }

  return undefined
}

function normalizeJsonText(value: string): string {
  const trimmedValue = value.trim()
  if (!trimmedValue) throw new Error('Cloudflare returned empty text')

  const fencedMatch = trimmedValue.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fencedMatch?.[1]) return fencedMatch[1].trim()

  const firstBraceIndex = trimmedValue.indexOf('{')
  const lastBraceIndex = trimmedValue.lastIndexOf('}')
  if (firstBraceIndex !== -1 && lastBraceIndex > firstBraceIndex) {
    return trimmedValue.slice(firstBraceIndex, lastBraceIndex + 1)
  }

  throw new Error(`Cloudflare returned non-JSON text: ${trimmedValue.slice(0, 120)}`)
}

function validatePlan(plan: ToolPlan, tools: PlannerRequestBody['tools']): void {
  if (!plan || typeof plan !== 'object') throw new Error('Invalid plan')
  if (typeof plan.toolName !== 'string') throw new Error('Invalid toolName')
  if (!plan.input || typeof plan.input !== 'object' || Array.isArray(plan.input)) throw new Error('Invalid input')
  if (typeof plan.confidence !== 'number') throw new Error('Invalid confidence')
  if (typeof plan.reason !== 'string') throw new Error('Invalid reason')
  if (!tools?.some(function hasSelectedTool(tool) {
    return tool.name === plan.toolName
  })) {
    throw new Error('Unknown tool')
  }
}

async function getCloudflareEnv(locals: App.Locals): Promise<CloudflareEnv> {
  try {
    const cloudflare = await import('cloudflare:workers')
    return cloudflare.env as CloudflareEnv
  } catch {
    return getLegacyRuntimeEnv(locals)
  }
}

function getLegacyRuntimeEnv(locals: App.Locals): CloudflareEnv {
  try {
    return locals.runtime?.env ?? {}
  } catch {
    return {}
  }
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: getJsonHeaders()
  })
}

function getJsonHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json'
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('Binding AI needs to be run remotely')) {
      return 'Cloudflare AI binding is not connected to remote Workers AI in this dev session.'
    }

    return error.message
  }
  return 'Server planner failed'
}
