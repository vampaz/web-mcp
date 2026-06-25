import type {
  PlannerAuth,
  PlannerContext,
  PlannerProviderConfig,
  PlannerRunOptions,
  ToolPlan,
  ToolPlanner,
  WebMCPTool
} from './interfaces/tool'
import { getErrorMessage } from './confirmation'
import { planWithHeuristics } from './heuristic-planner'
import { toolPlanSchema, validateToolPlan } from './plan-validation'

interface LanguageModelSession {
  prompt: (message: string, options?: ChromeAIPromptOptions) => Promise<string>
  destroy?: () => void
  dispose?: () => void
}

interface LanguageModelApi {
  availability: (options?: ChromeAIOptions) => Promise<ChromeAIAvailability>
  create: (options?: ChromeAIOptions) => Promise<LanguageModelSession>
}

interface WindowWithLanguageModel extends Window {
  LanguageModel?: LanguageModelApi
}

type ChromeAIAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable'
type ChromeAIOutputLanguage = 'en'

interface ChromeAIOptions {
  expectedInputs?: Array<{
    type: 'text'
    languages: ChromeAIOutputLanguage[]
  }>
  expectedOutputs?: Array<{
    type: 'text'
    languages: ChromeAIOutputLanguage[]
  }>
  initialPrompts?: Array<{
    role: 'system'
    content: string
  }>
}

interface ChromeAIPromptOptions {
  responseConstraint?: unknown
}

const chromeAITextOptions = {
  expectedInputs: [
    {
      type: 'text',
      languages: ['en']
    }
  ],
  expectedOutputs: [
    {
      type: 'text',
      languages: ['en']
    }
  ]
} satisfies ChromeAIOptions

export function createHeuristicPlanner(): ToolPlanner {
  return {
    name: 'Local heuristic planner',
    available: true,
    status: 'fallback',
    detail:
      'Chrome built-in AI is unavailable, so WebMCP Kit is using deterministic local planning.',
    async plan(
      message: string,
      tools: WebMCPTool[],
      context?: PlannerContext,
      options?: PlannerRunOptions
    ) {
      throwIfAborted(options?.signal)
      return planWithHeuristics(message, tools, context)
    }
  }
}

export async function createChromeAIPlanner(strict = false): Promise<ToolPlanner> {
  const languageModel = getLanguageModel()

  if (!languageModel) {
    return {
      name: 'Chrome built-in AI',
      available: false,
      status: 'unavailable',
      detail: 'The browser does not expose the Chrome built-in AI LanguageModel API.',
      async plan(
        message: string,
        tools: WebMCPTool[],
        context?: PlannerContext,
        options?: PlannerRunOptions
      ) {
        throwIfAborted(options?.signal)
        if (strict) throw new Error('Chrome built-in AI is unavailable.')
        return planWithHeuristics(message, tools, context)
      }
    }
  }

  try {
    const availability = await languageModel.availability(chromeAITextOptions)
    if (availability === 'unavailable') {
      return createUnavailableChromePlanner(
        'Chrome reports that built-in AI is unavailable in this environment.',
        strict
      )
    }

    if (availability === 'downloadable' || availability === 'downloading') {
      return createActiveChromePlanner(
        languageModel,
        availability,
        availability === 'downloadable'
          ? 'Chrome built-in AI can be used after Chrome downloads the model from a user command.'
          : 'Chrome is downloading the built-in AI model and will plan when the session is ready.',
        strict
      )
    }

    return createActiveChromePlanner(
      languageModel,
      'ready',
      'Chrome built-in AI is available. The model session will start from the next user command.',
      strict
    )
  } catch {
    return createUnavailableChromePlanner(
      'Chrome built-in AI could not create a planning session.',
      strict
    )
  }
}

export async function createBestPlanner(): Promise<ToolPlanner> {
  const chromePlanner = await createChromeAIPlanner()
  if (chromePlanner.available) return chromePlanner

  return createHeuristicPlanner()
}

export async function createConfiguredPlanner(
  config?: PlannerProviderConfig
): Promise<ToolPlanner> {
  if (!config || config.provider === 'auto') return createBestPlanner()

  if (config.provider === 'chrome-built-in') return createChromeAIPlanner(true)
  if (config.provider === 'local') return createHeuristicPlanner()

  return createRemotePlanner(config)
}

export function createRemotePlanner(config: PlannerProviderConfig): ToolPlanner {
  const providerLabel = getProviderLabel(config)
  const model = config.model ?? getDefaultModel(config)
  const auth = config.auth ?? { mode: 'none' }
  const serverBindingRequired = requiresServerBinding(config, auth)
  const key = getPlannerApiKey(config.provider, auth)
  const keyRequired = requiresBrowserKey(config, auth)

  if (serverBindingRequired) {
    return {
      name: providerLabel,
      available: false,
      status: 'unavailable',
      detail: `${providerLabel} needs server endpoint mode so the browser talks to a Worker with an AI binding.`,
      async plan() {
        throw new Error(`${providerLabel} needs server endpoint mode.`)
      }
    }
  }

  if (keyRequired && !key) {
    return {
      name: providerLabel,
      available: false,
      status: 'needs-key',
      detail: `${providerLabel} needs a user API key. In user-key mode the key is stored in the browser and visible to this page.`,
      async plan() {
        throw new Error(`${providerLabel} needs a user API key.`)
      }
    }
  }

  return {
    name: providerLabel,
    available: true,
    status: 'ready',
    detail: getRemotePlannerDetail(config, auth),
    async plan(
      message: string,
      tools: WebMCPTool[],
      context: PlannerContext = {},
      options?: PlannerRunOptions
    ) {
      try {
        throwIfAborted(options?.signal)
        const plan = await planWithRemoteProvider(
          config,
          auth,
          key,
          model,
          message,
          tools,
          context,
          options
        )
        throwIfAborted(options?.signal)
        validateToolPlan(plan, tools)
        return plan
      } catch (error) {
        throwIfAborted(options?.signal)
        throw new Error(`${providerLabel} could not plan this command (${getErrorMessage(error)})`)
      }
    }
  }
}

async function planWithChromeAI(
  session: LanguageModelSession,
  message: string,
  tools: WebMCPTool[],
  context: PlannerContext = {}
): Promise<ToolPlan> {
  const response = await session.prompt(createPlannerPrompt(message, tools, context), {
    responseConstraint: toolPlanSchema
  })

  return parseToolPlanJson(response, 'Chrome built-in AI')
}

function createChromeAISession(languageModel: LanguageModelApi): Promise<LanguageModelSession> {
  return languageModel.create({
    ...chromeAITextOptions,
    initialPrompts: [
      {
        role: 'system',
        content:
          'Choose one app tool, a short ordered tool_sequence, needs_clarification, or no_tools_match. Return only JSON matching the requested schema.'
      }
    ]
  })
}

async function planWithRemoteProvider(
  config: PlannerProviderConfig,
  auth: PlannerAuth,
  apiKey: string | undefined,
  model: string,
  message: string,
  tools: WebMCPTool[],
  context: PlannerContext,
  options?: PlannerRunOptions
): Promise<ToolPlan> {
  if (auth.mode === 'server') {
    return planWithServerEndpoint(auth.endpoint, config, model, message, tools, context, options)
  }

  return planWithOpenAICompatible(config, apiKey, model, message, tools, context, options)
}

async function planWithServerEndpoint(
  endpoint: string,
  config: PlannerProviderConfig,
  model: string,
  message: string,
  tools: WebMCPTool[],
  context: PlannerContext,
  options?: PlannerRunOptions
): Promise<ToolPlan> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      provider: config.provider,
      model,
      message,
      tools: createToolCatalog(tools),
      context,
      responseSchema: toolPlanSchema
    }),
    signal: options?.signal
  })

  if (!response.ok) {
    throw new Error(await getServerPlannerError(response))
  }

  return (await response.json()) as ToolPlan
}

async function planWithOpenAICompatible(
  config: PlannerProviderConfig,
  apiKey: string | undefined,
  model: string,
  message: string,
  tools: WebMCPTool[],
  context: PlannerContext,
  options?: PlannerRunOptions
): Promise<ToolPlan> {
  const baseUrl = getOpenAICompatibleBaseUrl(config)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  if (config.provider === 'openrouter' && typeof location !== 'undefined') {
    headers['HTTP-Referer'] = location.origin
    headers['X-Title'] = 'WebMCP Kit'
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: createPlannerMessages(message, tools, context),
      response_format: {
        type: 'json_object'
      },
      temperature: 0
    }),
    signal: options?.signal
  })

  if (!response.ok) {
    throw new Error(`${getProviderLabel(config)} returned ${response.status}`)
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error('provider returned no message content')

  return parseToolPlanJson(content, getProviderLabel(config))
}

function createPlannerMessages(message: string, tools: WebMCPTool[], context: PlannerContext) {
  return [
    {
      role: 'system',
      content:
        'Choose one app tool, a short ordered tool_sequence, needs_clarification, or no_tools_match. Return only JSON with toolName, input, confidence, reason, and optional steps.'
    },
    {
      role: 'user',
      content: createPlannerPrompt(message, tools, context)
    }
  ]
}

function createPlannerPrompt(
  message: string,
  tools: WebMCPTool[],
  context: PlannerContext
): string {
  return [
    `User request: ${message}`,
    `Current app context:\n${JSON.stringify(context, null, 2)}`,
    `Available tools:\n${JSON.stringify(createToolCatalog(tools), null, 2)}`,
    'Choose the best tool and exact parameters from the current app context. Prefer stable IDs from context over labels.',
    'If the request requires multiple app actions, return a chained plan with toolName "tool_sequence", input {}, and steps ordered by dependency. Use at most 5 steps. Each step must use one available tool and must be executable after the previous step updates app state.',
    'If the request is missing required information that is not present in context, return {"toolName":"needs_clarification","input":{},"confidence":0,"reason":"Ask for the missing information."}.',
    'If none of the available tools can satisfy the request, return {"toolName":"no_tools_match","input":{},"confidence":0,"reason":"Explain what kind of app action is available instead."}.',
    'Return only valid JSON matching this schema:',
    JSON.stringify(toolPlanSchema, null, 2)
  ].join('\n\n')
}

function createToolCatalog(tools: WebMCPTool[]) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }))
}

function getLanguageModel(): LanguageModelApi | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as WindowWithLanguageModel).LanguageModel
}

function createActiveChromePlanner(
  languageModel: LanguageModelApi,
  status: 'ready' | 'downloadable' | 'downloading',
  detail: string,
  strict = false
): ToolPlanner {
  let session: LanguageModelSession | undefined

  return {
    name: 'Chrome built-in AI',
    available: true,
    status,
    detail,
    async plan(
      message: string,
      tools: WebMCPTool[],
      context?: PlannerContext,
      options?: PlannerRunOptions
    ) {
      try {
        throwIfAborted(options?.signal)
        session ??= await createChromeAISession(languageModel)
        const plan = await planWithChromeAI(session, message, tools, context)
        validateToolPlan(plan, tools)
        throwIfAborted(options?.signal)
        return plan
      } catch (error) {
        throwIfAborted(options?.signal)
        if (strict)
          throw new Error(
            `Chrome built-in AI could not plan this command (${getErrorMessage(error)})`
          )

        return {
          ...planWithHeuristics(message, tools, context),
          reason: `Chrome built-in AI could not plan this command (${getErrorMessage(error)}). Used deterministic fallback.`
        }
      }
    },
    dispose() {
      disposeChromeAISession(session)
      session = undefined
    }
  }
}

function disposeChromeAISession(session: LanguageModelSession | undefined): void {
  if (typeof session?.destroy === 'function') {
    session.destroy()
    return
  }

  session?.dispose?.()
}

function parseToolPlanJson(value: string, source: string): ToolPlan {
  try {
    return JSON.parse(normalizeJsonText(value, source)) as ToolPlan
  } catch {
    throw new Error(`${source} returned unparseable JSON`)
  }
}

export function normalizeJsonText(value: string, source = 'AI'): string {
  const trimmedValue = value.trim()
  if (!trimmedValue) throw new Error(`${source} returned empty text`)

  const fencedMatch = trimmedValue.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fencedMatch?.[1]) return fencedMatch[1].trim()

  const firstBraceIndex = trimmedValue.indexOf('{')
  const lastBraceIndex = trimmedValue.lastIndexOf('}')
  if (firstBraceIndex !== -1 && lastBraceIndex > firstBraceIndex) {
    return trimmedValue.slice(firstBraceIndex, lastBraceIndex + 1)
  }

  throw new Error(`${source} returned non-JSON text: ${trimmedValue.slice(0, 120)}`)
}

function createUnavailableChromePlanner(detail: string, strict = false): ToolPlanner {
  return {
    name: 'Chrome built-in AI',
    available: false,
    status: 'unavailable',
    detail,
    async plan(
      message: string,
      tools: WebMCPTool[],
      context?: PlannerContext,
      options?: PlannerRunOptions
    ) {
      throwIfAborted(options?.signal)
      if (strict) throw new Error(detail)
      return planWithHeuristics(message, tools, context)
    }
  }
}

function getPlannerApiKey(
  provider: PlannerProviderConfig['provider'],
  auth: PlannerAuth
): string | undefined {
  if (auth.mode !== 'user-key') return undefined
  if (auth.apiKey) return auth.apiKey
  const storage = getBrowserStorage()
  if (!storage) return undefined

  const storageKey = auth.storageKey ?? getDefaultStorageKey(provider)
  return storage.getItem(storageKey) ?? undefined
}

function getBrowserStorage(): Storage | undefined {
  const storage =
    typeof window !== 'undefined'
      ? window.localStorage
      : typeof localStorage !== 'undefined'
        ? localStorage
        : undefined

  if (!storage || typeof storage.getItem !== 'function') return undefined

  return storage
}

function requiresBrowserKey(config: PlannerProviderConfig, auth: PlannerAuth): boolean {
  return (
    auth.mode === 'user-key' &&
    config.provider !== 'chrome-built-in' &&
    config.provider !== 'local' &&
    config.provider !== 'cloudflare-binding'
  )
}

function requiresServerBinding(config: PlannerProviderConfig, auth: PlannerAuth): boolean {
  return config.provider === 'cloudflare-binding' && auth.mode !== 'server'
}

function getRemotePlannerDetail(config: PlannerProviderConfig, auth: PlannerAuth): string {
  const provider = getProviderLabel(config)
  if (config.provider === 'cloudflare-binding')
    return `${provider} will plan through ${auth.mode === 'server' ? auth.endpoint : 'a server endpoint'} using a Cloudflare AI binding.`
  if (auth.mode === 'server')
    return `${provider} will plan through ${auth.endpoint}; provider secrets stay server-side.`
  if (auth.mode === 'user-key')
    return `${provider} will plan directly from the browser with a user-provided key. This is convenient but the key is visible to this page.`
  return `${provider} will plan without an API key.`
}

function getOpenAICompatibleBaseUrl(config: PlannerProviderConfig): string {
  if (config.provider === 'openrouter') return config.baseUrl ?? 'https://openrouter.ai/api/v1'
  if (config.provider === 'openai') return config.baseUrl ?? 'https://api.openai.com/v1'
  if (!config.baseUrl) throw new Error('OpenAI-compatible planning needs baseUrl')

  return config.baseUrl
}

function getDefaultModel(config: PlannerProviderConfig): string {
  if (config.provider === 'openrouter') return 'openrouter/auto'
  if (config.provider === 'openai') return 'gpt-5.4-mini'
  if (config.provider === 'cloudflare-binding') return '@cf/zai-org/glm-4.7-flash'

  return 'default'
}

function getProviderLabel(config: PlannerProviderConfig): string {
  if (config.provider === 'openrouter') return 'OpenRouter'
  if (config.provider === 'openai') return 'OpenAI'
  if (config.provider === 'openai-compatible') return 'OpenAI-compatible provider'
  if (config.provider === 'cloudflare-binding') return 'Cloudflare binding'
  if (config.provider === 'chrome-built-in') return 'Chrome built-in AI'
  if (config.provider === 'local') return 'Local heuristic planner'

  return 'Planner'
}

function getDefaultStorageKey(provider: PlannerProviderConfig['provider']): string {
  return `@vampaz/webmcp-kit:${provider}:api-key`
}

async function getServerPlannerError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string }
    if (payload.error) return `server planner returned ${response.status}: ${payload.error}`
  } catch {
    return `server planner returned ${response.status}`
  }

  return `server planner returned ${response.status}`
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return
  throw new Error('Planner request was cancelled.')
}
