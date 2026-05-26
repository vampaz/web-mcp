import type { APIRoute } from 'astro'
import {
  getErrorMessage,
  normalizeJsonText,
  type JsonSchema,
  validateToolPlan
} from '@webmcp-kit/core'

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

type OpenAIChatResult = {
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
    inputSchema?: JsonSchema
  }>
  context?: unknown
}

type ToolPlan = {
  toolName: string
  input: Record<string, unknown>
  confidence: number
  reason: string
  steps?: ToolPlanStep[]
}

type ToolPlanStep = {
  toolName: string
  input: Record<string, unknown>
  confidence: number
  reason: string
}

class AiEndpointError extends Error {
  constructor(
    providerLabel: string,
    public readonly status: number,
    public readonly responseText: string
  ) {
    super(`${providerLabel} returned ${status}`)
    this.name = 'AiEndpointError'
  }
}

const allowedCloudflareModels = new Set([
  '@cf/zai-org/glm-4.7-flash',
  '@cf/google/gemma-4-26b-a4b-it',
  '@cf/moonshotai/kimi-k2.6',
  '@cf/qwen/qwen3-30b-a3b-fp8',
  '@cf/openai/gpt-oss-20b',
  '@cf/nvidia/nemotron-3-120b-a12b',
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
  '@cf/qwen/qwq-32b'
])
const openAIApiModel = 'gpt-5.4-mini'
const allowedOpenRouterModels = new Set([
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nvidia/nemotron-nano-9b-v2:free'
])
const maxPlannerRequestBytes = 128 * 1024

export const prerender = false

export const POST: APIRoute = async function planWithServerProvider({ request, locals }) {
  const requestBody = await readPlannerRequest(request)
  if ('error' in requestBody) return json({ error: requestBody.error }, requestBody.status)

  const body = requestBody.body
  if (!body.message || !Array.isArray(body.tools))
    return json({ error: 'Invalid planner request' }, 400)
  const env = await getCloudflareEnv(locals)

  try {
    if (body.provider === 'cloudflare-binding') {
      if (!body.model || !allowedCloudflareModels.has(body.model))
        return json({ error: 'Unsupported Cloudflare model' }, 400)
      return json(await planWithCloudflareBinding(body, env))
    }

    if (body.provider === 'cloudflare-workers-ai') {
      if (!body.model || !allowedCloudflareModels.has(body.model))
        return json({ error: 'Unsupported Cloudflare model' }, 400)
      return json(await planWithCloudflareRest(body, env))
    }

    if (body.provider === 'openai') {
      const model = getOpenAIModel(body.model)
      if (!model) return json({ error: 'Unsupported OpenAI model' }, 400)
      return json(await planWithOpenAI(body, env, model))
    }

    if (body.provider === 'openrouter') {
      if (!body.model || !allowedOpenRouterModels.has(body.model))
        return json({ error: 'Unsupported OpenRouter model' }, 400)
      return json(await planWithOpenRouter(body, env, body.model))
    }
  } catch (error) {
    const publicError = getPublicErrorMessage(error)
    logServerPlannerFailure(error, body, publicError)
    return json(createPlannerErrorResponse(error, publicError), 502)
  }

  return json({ error: 'Unsupported server planner provider' }, 400)
}

export const OPTIONS: APIRoute = function handleOptions() {
  return new Response(null, {
    headers: getJsonHeaders()
  })
}

async function planWithCloudflareBinding(
  body: PlannerRequestBody,
  env: CloudflareEnv
): Promise<ToolPlan> {
  const ai = env.AI
  if (!ai) {
    throw new Error(
      'Cloudflare AI binding is unavailable in this runtime. Restart dev with the Astro Cloudflare adapter and remote bindings enabled, or use a Cloudflare preview deployment.'
    )
  }

  const result = await runCloudflareBindingPlanner(body, ai)

  return parseAndValidatePlan(extractResponseText(result), body.tools)
}

async function planWithCloudflareRest(
  body: PlannerRequestBody,
  env: CloudflareEnv
): Promise<ToolPlan> {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID ?? import.meta.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = env.CLOUDFLARE_API_TOKEN ?? import.meta.env.CLOUDFLARE_API_TOKEN
  if (!accountId || !apiToken) {
    throw new Error(
      'Cloudflare Workers AI server mode needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN on the server, or a custom planner endpoint.'
    )
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${body.model}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createCloudflarePlannerInput(body, true))
    }
  )

  if (!response.ok) throw await createAiEndpointError('Cloudflare Workers AI', response)

  const payload = (await response.json()) as { result?: { response?: string } }
  return parseAndValidatePlan(payload.result?.response?.trim(), body.tools)
}

async function planWithOpenAI(
  body: PlannerRequestBody,
  env: CloudflareEnv,
  model: string
): Promise<ToolPlan> {
  const apiKey = env.OPENAI_API_KEY ?? import.meta.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OpenAI server mode needs OPENAI_API_KEY on the server.')
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: createPlannerMessages(body),
      response_format: {
        type: 'json_object'
      }
    })
  })

  if (!response.ok) throw await createAiEndpointError('OpenAI', response)

  const payload = (await response.json()) as OpenAIChatResult
  return parseAndValidatePlan(payload.choices?.[0]?.message?.content?.trim(), body.tools, 'OpenAI')
}

async function planWithOpenRouter(
  body: PlannerRequestBody,
  env: CloudflareEnv,
  model: string
): Promise<ToolPlan> {
  const apiKey = env.OPENROUTER_API_KEY ?? import.meta.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error('OpenRouter server mode needs OPENROUTER_API_KEY on the server.')
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: createPlannerMessages(body),
      response_format: {
        type: 'json_object'
      }
    })
  })

  if (!response.ok) throw await createAiEndpointError('OpenRouter', response)

  const payload = (await response.json()) as OpenAIChatResult
  return parseAndValidatePlan(
    payload.choices?.[0]?.message?.content?.trim(),
    body.tools,
    'OpenRouter'
  )
}

async function runCloudflareBindingPlanner(
  body: PlannerRequestBody,
  ai: NonNullable<CloudflareEnv['AI']>
): Promise<CloudflareAiResult> {
  try {
    return (await ai.run(
      body.model ?? '',
      createCloudflarePlannerInput(body, true) as never
    )) as CloudflareAiResult
  } catch (error) {
    if (!shouldRetryWithoutResponseFormat(error)) throw error
  }

  return (await ai.run(
    body.model ?? '',
    createCloudflarePlannerInput(body, false) as never
  )) as CloudflareAiResult
}

type PlannerRequestReadResult =
  | { body: PlannerRequestBody; error?: never; status?: never }
  | { body?: never; error: string; status: number }

async function readPlannerRequest(request: Request): Promise<PlannerRequestReadResult> {
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > maxPlannerRequestBytes) {
    return {
      error: 'Planner request is too large.',
      status: 413
    }
  }

  try {
    const text = await request.text()
    if (text.length > maxPlannerRequestBytes) {
      return {
        error: 'Planner request is too large.',
        status: 413
      }
    }

    return {
      body: JSON.parse(text) as PlannerRequestBody
    }
  } catch {
    return {
      body: {}
    }
  }
}

function createPlannerMessages(body: PlannerRequestBody): CloudflareAiInput['messages'] {
  return [
    {
      role: 'system',
      content:
        'Choose one WebMCP tool, or a short ordered tool_sequence when the request requires multiple app actions. Return only one raw JSON object with toolName, input, confidence, reason, and optional steps. Do not return Markdown, HTML, prose, or a code fence.'
    },
    {
      role: 'user',
      content: [
        `User request: ${body.message}`,
        `Current app context:\n${JSON.stringify(body.context ?? {}, null, 2)}`,
        `Available tools:\n${JSON.stringify(body.tools ?? [], null, 2)}`,
        'Use stable IDs from context when selecting existing items.',
        'If the request requires multiple app actions, return {"toolName":"tool_sequence","input":{},"confidence":0.9,"reason":"Brief reason for the chain.","steps":[{"toolName":"tool_name","input":{"id":"stable_id_from_context"},"confidence":0.9,"reason":"Brief reason for this step."}]} with at most 5 steps.',
        'For one app action, return {"toolName":"tool_name","input":{"id":"stable_id_from_context"},"confidence":0.9,"reason":"Brief reason for the selected tool."}'
      ].join('\n\n')
    }
  ]
}

function createCloudflarePlannerInput(
  body: PlannerRequestBody,
  useJsonResponseFormat: boolean
): CloudflareAiInput {
  const input: CloudflareAiInput = {
    messages: createPlannerMessages(body),
    temperature: 0
  }

  if (useJsonResponseFormat) {
    input.response_format = {
      type: 'json_object'
    }
  }

  return input
}

function shouldRetryWithoutResponseFormat(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase()
  return (
    message.includes('response_format') ||
    message.includes('response format') ||
    message.includes('json') ||
    message.includes('schema') ||
    message.includes('unsupported') ||
    message.includes('not support')
  )
}

async function createAiEndpointError(
  providerLabel: string,
  response: Response
): Promise<AiEndpointError> {
  return new AiEndpointError(
    providerLabel,
    response.status,
    await readAiEndpointErrorBody(response)
  )
}

async function readAiEndpointErrorBody(response: Response): Promise<string> {
  try {
    return await response.text()
  } catch {
    return ''
  }
}

function parseAndValidatePlan(
  response: string | undefined,
  tools: PlannerRequestBody['tools'],
  providerLabel = 'Cloudflare'
): ToolPlan {
  if (!response) throw new Error(`${providerLabel} returned no response`)

  let plan: ToolPlan
  try {
    plan = JSON.parse(normalizeJsonText(response, providerLabel)) as ToolPlan
  } catch {
    throw new Error(`${providerLabel} returned invalid JSON`)
  }
  validateToolPlan(plan, tools ?? [], { messageStyle: 'server' })

  return plan
}

function extractResponseText(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim()

  if (
    value &&
    typeof value === 'object' &&
    'response' in value &&
    typeof value.response === 'string'
  ) {
    return value.response.trim()
  }

  if (value && typeof value === 'object' && 'choices' in value && Array.isArray(value.choices)) {
    const content = value.choices[0]?.message?.content
    return typeof content === 'string' ? content.trim() : undefined
  }

  return undefined
}

function getOpenAIModel(model: string | undefined): string | undefined {
  if (!model || model === openAIApiModel) return openAIApiModel
  return undefined
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

function logServerPlannerFailure(
  error: unknown,
  body: PlannerRequestBody,
  publicError: string
): void {
  console.error('Server planner returned 502', {
    event: 'webmcp.serverPlanner.502',
    provider: body.provider,
    model: body.model,
    status: error instanceof AiEndpointError ? error.status : undefined,
    toolCount: Array.isArray(body.tools) ? body.tools.length : 0,
    toolNames: getPlannerToolNames(body.tools),
    messageLength: typeof body.message === 'string' ? body.message.length : 0,
    publicError,
    error: serializePlannerError(error)
  })
}

function getPlannerToolNames(tools: PlannerRequestBody['tools']): string[] {
  if (!Array.isArray(tools)) return []

  return tools
    .map(function getToolName(tool) {
      return tool.name
    })
    .filter(function hasToolName(name): name is string {
      return typeof name === 'string'
    })
    .slice(0, 20)
}

function serializePlannerError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return {
      message: sanitizeLogText(String(error))
    }
  }

  return {
    name: error.name,
    message: sanitizeLogText(error.message),
    upstreamResponse:
      error instanceof AiEndpointError ? sanitizeLogText(error.responseText) : undefined,
    stack: sanitizeLogText(error.stack ?? '')
  }
}

function sanitizeLogText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-[redacted]')
    .slice(0, 2000)
}

function createPlannerErrorResponse(
  error: unknown,
  publicError: string
): { error: string; upstreamError?: string } {
  if (!import.meta.env.DEV || !(error instanceof AiEndpointError) || !error.responseText) {
    return {
      error: publicError
    }
  }

  return {
    error: publicError,
    upstreamError: sanitizeLogText(error.responseText)
  }
}

function getPublicErrorMessage(error: unknown): string {
  const message = getErrorMessage(error)

  if (message.includes('Binding AI needs to be run remotely')) {
    return 'Cloudflare AI binding is not connected to remote Workers AI in this dev session.'
  }

  if (message.includes('CLOUDFLARE_ACCOUNT_ID') || message.includes('CLOUDFLARE_API_TOKEN')) {
    return 'Cloudflare Workers AI server mode needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN on the server, or a custom planner endpoint.'
  }

  if (message.includes('OPENAI_API_KEY')) {
    return 'OpenAI server mode needs OPENAI_API_KEY on the server.'
  }

  if (message.includes('OPENROUTER_API_KEY')) {
    return 'OpenRouter server mode needs OPENROUTER_API_KEY on the server.'
  }

  if (isSafePlannerFailureMessage(message)) {
    return message
  }

  if (import.meta.env.DEV) {
    return `Server planner failed: ${message}`
  }

  return 'Server planner failed'
}

function isSafePlannerFailureMessage(message: string): boolean {
  return (
    message.startsWith('Cloudflare returned') ||
    message.startsWith('OpenAI returned') ||
    message.startsWith('OpenRouter returned') ||
    message.startsWith('Invalid ') ||
    message.startsWith('Unknown tool') ||
    message.startsWith('Selected tool has no input schema') ||
    message.startsWith('Tool sequence is too long')
  )
}
