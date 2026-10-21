import type {
  ResolverAuth,
  ResolverContext,
  ResolverProviderConfig,
  RemoteResolverConfig,
  ResolverRunOptions,
  ToolResolution,
  ToolResolver,
  WebMCPTool
} from './interfaces/tool'
import { getErrorMessage } from './confirmation'
import { resolveWithHeuristics } from './heuristic-resolver'
import {
  createStructuredToolResolutionSchema,
  createToolResolutionSchema,
  validateToolResolution
} from './resolution-validation'
import { formatJsonValueValidationError, validateJsonValue } from './schema'
import { ResolverRequestLimitError, serializeResolverRequest } from './resolver-request'

interface LanguageModelSession {
  clone: (options?: { signal?: AbortSignal }) => Promise<LanguageModelSession>
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
  signal?: AbortSignal
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

export function createHeuristicResolver(): ToolResolver {
  return {
    name: 'Local heuristic resolver',
    available: true,
    status: 'fallback',
    detail:
      'Chrome built-in AI is unavailable, so WebMCP Kit is using deterministic local resolution.',
    async resolve(
      message: string,
      tools: WebMCPTool[],
      context?: ResolverContext,
      options?: ResolverRunOptions
    ) {
      throwIfAborted(options?.signal)
      return resolveWithHeuristics(message, tools, context)
    }
  }
}

export async function createChromeAIResolver(strict = false): Promise<ToolResolver> {
  const languageModel = getLanguageModel()

  if (!languageModel) {
    return {
      name: 'Chrome built-in AI',
      available: false,
      status: 'unavailable',
      detail: 'The browser does not expose the Chrome built-in AI LanguageModel API.',
      async resolve(
        message: string,
        tools: WebMCPTool[],
        context?: ResolverContext,
        options?: ResolverRunOptions
      ) {
        throwIfAborted(options?.signal)
        if (strict) throw new Error('Chrome built-in AI is unavailable.')
        return resolveWithHeuristics(message, tools, context)
      }
    }
  }

  try {
    const availability = await languageModel.availability(chromeAITextOptions)
    if (availability === 'unavailable') {
      return createUnavailableChromeResolver(
        'Chrome reports that built-in AI is unavailable in this environment.',
        strict
      )
    }

    if (availability === 'downloadable' || availability === 'downloading') {
      return createActiveChromeResolver(
        languageModel,
        availability,
        availability === 'downloadable'
          ? 'Chrome built-in AI can be used after Chrome downloads the model from a user command.'
          : 'Chrome is downloading the built-in AI model and will resolve when the session is ready.',
        strict
      )
    }

    return createActiveChromeResolver(
      languageModel,
      'ready',
      'Chrome built-in AI is available. The model session will start from the next user command.',
      strict
    )
  } catch {
    return createUnavailableChromeResolver(
      'Chrome built-in AI could not create a resolution session.',
      strict
    )
  }
}

export async function createBestResolver(): Promise<ToolResolver> {
  const chromeResolver = await createChromeAIResolver()
  if (chromeResolver.available) return chromeResolver

  return createHeuristicResolver()
}

export async function createResolver(config?: ResolverProviderConfig): Promise<ToolResolver> {
  if (!config || config.provider === 'auto') return createBestResolver()

  if (config.provider === 'chrome-built-in') return createChromeAIResolver(true)
  if (config.provider === 'local') return createHeuristicResolver()

  return createRemoteResolver(config)
}

export function createRemoteResolver(config: RemoteResolverConfig): ToolResolver {
  if (
    config.maxTokens !== undefined &&
    (!Number.isSafeInteger(config.maxTokens) || config.maxTokens < 1 || config.maxTokens > 65536)
  )
    throw new Error('maxTokens must be an integer between 1 and 65536.')
  if (
    config.temperature !== undefined &&
    (!Number.isFinite(config.temperature) || config.temperature < 0 || config.temperature > 2)
  )
    throw new Error('temperature must be between 0 and 2.')
  const providerLabel = getProviderLabel(config)
  const model = config.model ?? getDefaultModel(config)
  const auth = config.auth ?? { mode: 'none' }
  const serverBindingRequired = requiresServerBinding(config, auth)
  const key = getResolverApiKey(config.provider, auth)
  const keyRequired = requiresBrowserKey(config, auth)

  if (serverBindingRequired) {
    return {
      name: providerLabel,
      available: false,
      status: 'unavailable',
      detail: `${providerLabel} needs server endpoint mode so the browser talks to a Worker with an AI binding.`,
      async resolve() {
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
      async resolve() {
        throw new Error(`${providerLabel} needs a user API key.`)
      }
    }
  }

  return {
    capabilities: { conversation: true },
    name: providerLabel,
    available: true,
    status: 'ready',
    detail: getRemoteResolverDetail(config, auth),
    async resolve(
      message: string,
      tools: WebMCPTool[],
      context: ResolverContext = {},
      options?: ResolverRunOptions
    ) {
      try {
        throwIfAborted(options?.signal)
        const resolution = await resolveWithRemoteProvider(
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
        validateToolResolution(resolution, tools, options)
        return resolution
      } catch (error) {
        throwIfAborted(options?.signal)
        if (error instanceof ResolverRequestLimitError) throw error
        throw new Error(
          `${providerLabel} could not resolve this command (${getErrorMessage(error)})`
        )
      }
    }
  }
}

async function resolveWithChromeAI(
  session: LanguageModelSession,
  message: string,
  tools: WebMCPTool[],
  context: ResolverContext = {},
  options?: ResolverRunOptions
): Promise<ToolResolution> {
  throwIfAborted(options?.signal)
  const prompt = createResolverPrompt(
    message,
    tools,
    context,
    options?.singleStep,
    false,
    options?.purpose
  )
  const responseConstraint = createToolResolutionSchema(
    tools,
    options?.singleStep,
    options?.purpose
  )
  serializeResolverRequest({ prompt, responseConstraint }, options?.maxRequestBytes)
  const response = await session.prompt(prompt, {
    responseConstraint,
    ...(options?.signal ? { signal: options.signal } : {})
  })

  return parseToolResolutionJson(response, 'Chrome built-in AI')
}

function createChromeAISession(languageModel: LanguageModelApi): Promise<LanguageModelSession> {
  return languageModel.create({
    ...chromeAITextOptions,
    initialPrompts: [
      {
        role: 'system',
        content: 'Follow the request instructions. Return only JSON matching the requested schema.'
      }
    ]
  })
}

async function resolveWithRemoteProvider(
  config: RemoteResolverConfig,
  auth: ResolverAuth,
  apiKey: string | undefined,
  model: string,
  message: string,
  tools: WebMCPTool[],
  context: ResolverContext,
  options?: ResolverRunOptions
): Promise<ToolResolution> {
  if (auth.mode === 'server') {
    return resolveWithServerEndpoint(auth.endpoint, config, model, message, tools, context, options)
  }

  return resolveWithOpenAICompatible(config, apiKey, model, message, tools, context, options)
}

async function resolveWithServerEndpoint(
  endpoint: string,
  config: RemoteResolverConfig,
  model: string,
  message: string,
  tools: WebMCPTool[],
  context: ResolverContext,
  options?: ResolverRunOptions
): Promise<ToolResolution> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: serializeResolverRequest(
      {
        provider: config.provider,
        model,
        message,
        tools: createToolCatalog(tools),
        context,
        responseSchema: createToolResolutionSchema(tools, options?.singleStep, options?.purpose),
        ...(options?.singleStep || options?.purpose === 'summary' ? { singleStep: true } : {}),
        ...(options?.purpose ? { purpose: options.purpose } : {})
      },
      options?.maxRequestBytes
    ),
    signal: options?.signal
  })

  if (!response.ok) {
    throw new Error(await getServerResolverError(response))
  }

  return (await response.json()) as ToolResolution
}

async function resolveWithOpenAICompatible(
  config: RemoteResolverConfig,
  apiKey: string | undefined,
  model: string,
  message: string,
  tools: WebMCPTool[],
  context: ResolverContext,
  options?: ResolverRunOptions
): Promise<ToolResolution> {
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

  const structured = config.responseFormat === 'json_schema'
  const singleStep = options?.singleStep === true || options?.purpose === 'summary'
  const wrapped = structured && singleStep
  const responseSchema = wrapped
    ? createStructuredToolResolutionSchema(tools, options?.purpose)
    : createToolResolutionSchema(tools, singleStep, options?.purpose)

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    body: serializeResolverRequest(
      {
        model,
        messages: createResolverMessages(
          message,
          tools,
          context,
          singleStep,
          structured,
          options?.purpose
        ),
        response_format:
          config.responseFormat === 'json_schema'
            ? {
                type: 'json_schema',
                json_schema: {
                  name: 'webmcp_resolution',
                  schema: responseSchema
                }
              }
            : {
                type: 'json_object'
              },
        temperature: config.temperature ?? 0,
        ...(config.maxTokens !== undefined ? { max_tokens: config.maxTokens } : {}),
        ...(config.reasoningEffort !== undefined
          ? { reasoning_effort: config.reasoningEffort }
          : {})
      },
      options?.maxRequestBytes
    ),
    signal: options?.signal
  })

  if (!response.ok) {
    throw new Error(`${getProviderLabel(config)} returned ${response.status}`)
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
  }
  if (payload.choices?.[0]?.finish_reason === 'length')
    throw new Error('provider reached the output token limit')
  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error('provider returned no message content')

  const parsed = parseToolResolutionJson(content, getProviderLabel(config))
  if (!wrapped) return parsed
  const action = (parsed as unknown as { action?: unknown } | null)?.action
  validateToolResolution(action, tools, { singleStep: true, purpose: options?.purpose })
  const errors = validateJsonValue(parsed, responseSchema)
  if (errors.length)
    throw new Error(
      `provider returned invalid structured resolution: ${formatJsonValueValidationError(errors)}`
    )
  return action as ToolResolution
}

function createResolverMessages(
  message: string,
  tools: WebMCPTool[],
  context: ResolverContext,
  singleStep = false,
  structured = false,
  purpose?: ResolverRunOptions['purpose']
) {
  return [
    {
      role: 'system',
      content:
        purpose === 'summary'
          ? 'Summarize the supplied conversation through the offered tool. Do not select application actions, ask for clarification, or answer the original request. ' +
            (structured
              ? 'Return only JSON with an action object containing toolName, input, confidence, and reason.'
              : 'Return only JSON with toolName, input, confidence, and reason.')
          : singleStep
            ? 'Choose exactly one next app tool, needs_clarification, or no_tools_match. Never return tool_sequence or steps. ' +
              (structured
                ? 'Return only JSON with an action object containing toolName, input, confidence, and reason.'
                : 'Return only JSON with toolName, input, confidence, and reason.')
            : 'Choose one app tool, a short ordered tool_sequence, needs_clarification, or no_tools_match. Return only JSON with toolName, input, confidence, reason, and optional steps.'
    },
    {
      role: 'user',
      content: createResolverPrompt(message, tools, context, singleStep, structured, purpose)
    }
  ]
}

function createResolverPrompt(
  message: string,
  tools: WebMCPTool[],
  context: ResolverContext,
  singleStep = false,
  structured = false,
  purpose?: ResolverRunOptions['purpose']
): string {
  singleStep ||= purpose === 'summary'
  function outcomeExample(toolName: string, reason: string) {
    const resolution = { toolName, input: {}, confidence: 0, reason }
    return JSON.stringify(structured && singleStep ? { action: resolution } : resolution)
  }
  return [
    `User request: ${message}`,
    `Current app context:\n${JSON.stringify(context)}`,
    `Available tools:\n${JSON.stringify(createToolCatalog(tools))}`,
    'Put only the selected tool arguments inside input. confidence and reason are siblings of toolName, never inside input unless the tool explicitly defines them.',
    ...(purpose === 'summary'
      ? []
      : [
          'Choose the best tool and exact parameters from the current app context. Prefer stable IDs from context over labels.',
          singleStep
            ? 'Choose only the next unfinished action. Return one tool invocation, never a sequence or steps. Wait for the actual result before choosing another action. Never invent future tool results or placeholders.'
            : 'If the request requires multiple app actions, return a chained resolution with toolName "tool_sequence", input {}, and steps ordered by dependency. Use at most 5 steps. Each step must use one available tool and must be executable after the previous step updates app state.',
          `If the request is missing required information that is not present in context, return ${outcomeExample('needs_clarification', 'Ask for the missing information.')}.`,
          `If none of the available tools can satisfy the request, return ${outcomeExample('no_tools_match', 'Explain what kind of app action is available instead.')}.`
        ]),
    ...(structured
      ? [
          'Follow the response schema supplied by the model API.' +
            (singleStep ? ' Wrap the single resolution in action.' : '')
        ]
      : [
          'Return only valid JSON matching this schema:',
          JSON.stringify(createToolResolutionSchema(tools, singleStep, purpose))
        ])
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

function createActiveChromeResolver(
  languageModel: LanguageModelApi,
  status: 'ready' | 'downloadable' | 'downloading',
  detail: string,
  strict = false
): ToolResolver {
  let session: LanguageModelSession | undefined
  let pendingSession: Promise<LanguageModelSession> | undefined
  let disposed = false
  const activeSessions = new Set<LanguageModelSession>()

  return {
    capabilities: { conversation: strict },
    name: 'Chrome built-in AI',
    available: true,
    status,
    detail,
    async resolve(
      message: string,
      tools: WebMCPTool[],
      context?: ResolverContext,
      options?: ResolverRunOptions
    ) {
      try {
        throwIfAborted(options?.signal)
        if (disposed) throw new Error('The resolver was disposed.')
        pendingSession ??= createChromeAISession(languageModel)
          .then(function created(value) {
            if (disposed) {
              disposeChromeAISession(value)
              throw new Error('The resolver was disposed.')
            }
            session = value
            return value
          })
          .catch(function failed(error) {
            pendingSession = undefined
            throw error
          })
        const base = await pendingSession
        throwIfAborted(options?.signal)
        const current = await base.clone({ signal: options?.signal })
        try {
          activeSessions.add(current)
          if (disposed) throw new Error('The resolver was disposed.')
          const resolution = await resolveWithChromeAI(current, message, tools, context, options)
          if (disposed) throw new Error('The resolver was disposed.')
          validateToolResolution(resolution, tools, options)
          throwIfAborted(options?.signal)
          return resolution
        } finally {
          if (activeSessions.delete(current)) disposeChromeAISession(current)
        }
      } catch (error) {
        throwIfAborted(options?.signal)
        if (disposed) throw new Error('The resolver was disposed.')
        if (error instanceof ResolverRequestLimitError) throw error
        if (strict)
          throw new Error(
            `Chrome built-in AI could not resolve this command (${getErrorMessage(error)})`
          )

        return {
          ...resolveWithHeuristics(message, tools, context),
          reason: `Chrome built-in AI could not resolve this command (${getErrorMessage(error)}). Used deterministic fallback.`
        }
      }
    },
    dispose() {
      disposed = true
      disposeChromeAISession(session)
      session = undefined
      for (const active of activeSessions) disposeChromeAISession(active)
      activeSessions.clear()
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

function parseToolResolutionJson(value: string, source: string): ToolResolution {
  try {
    return JSON.parse(normalizeJsonText(value, source)) as ToolResolution
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

function createUnavailableChromeResolver(detail: string, strict = false): ToolResolver {
  return {
    name: 'Chrome built-in AI',
    available: false,
    status: 'unavailable',
    detail,
    async resolve(
      message: string,
      tools: WebMCPTool[],
      context?: ResolverContext,
      options?: ResolverRunOptions
    ) {
      throwIfAborted(options?.signal)
      if (strict) throw new Error(detail)
      return resolveWithHeuristics(message, tools, context)
    }
  }
}

function getResolverApiKey(
  provider: ResolverProviderConfig['provider'],
  auth: ResolverAuth
): string | undefined {
  if (auth.mode !== 'user-key') return undefined
  if (auth.apiKey) return auth.apiKey
  try {
    const storage = getBrowserStorage()
    const storageKey = auth.storageKey ?? getDefaultStorageKey(provider)
    return storage?.getItem(storageKey) ?? undefined
  } catch {
    return undefined
  }
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

function requiresBrowserKey(config: RemoteResolverConfig, auth: ResolverAuth): boolean {
  return auth.mode === 'user-key' && config.provider !== 'cloudflare-binding'
}

function requiresServerBinding(config: RemoteResolverConfig, auth: ResolverAuth): boolean {
  return config.provider === 'cloudflare-binding' && auth.mode !== 'server'
}

function getRemoteResolverDetail(config: RemoteResolverConfig, auth: ResolverAuth): string {
  const provider = getProviderLabel(config)
  if (config.provider === 'cloudflare-binding')
    return `${provider} will resolve through ${auth.mode === 'server' ? auth.endpoint : 'a server endpoint'} using a Cloudflare AI binding.`
  if (auth.mode === 'server')
    return `${provider} will resolve through ${auth.endpoint}; provider secrets stay server-side.`
  if (auth.mode === 'user-key')
    return `${provider} will resolve directly from the browser with a user-provided key. This is convenient but the key is visible to this page.`
  return `${provider} will resolve without an API key.`
}

function getOpenAICompatibleBaseUrl(config: RemoteResolverConfig): string {
  if (config.provider === 'openrouter') return config.baseUrl ?? 'https://openrouter.ai/api/v1'
  if (config.provider === 'openai') return config.baseUrl ?? 'https://api.openai.com/v1'
  if (!config.baseUrl) throw new Error('OpenAI-compatible resolving needs baseUrl')

  return config.baseUrl
}

function getDefaultModel(config: RemoteResolverConfig): string {
  if (config.provider === 'openrouter') return 'openrouter/auto'
  if (config.provider === 'openai') return 'gpt-5.4-mini'
  if (config.provider === 'cloudflare-binding') return '@cf/zai-org/glm-4.7-flash'

  return 'default'
}

function getProviderLabel(config: RemoteResolverConfig): string {
  if (config.provider === 'openrouter') return 'OpenRouter'
  if (config.provider === 'openai') return 'OpenAI'
  if (config.provider === 'openai-compatible') return 'OpenAI-compatible provider'
  if (config.provider === 'cloudflare-binding') return 'Cloudflare binding'
  if (config.provider === 'chrome-built-in') return 'Chrome built-in AI'
  if (config.provider === 'local') return 'Local heuristic resolver'

  return 'Resolver'
}

function getDefaultStorageKey(provider: ResolverProviderConfig['provider']): string {
  return `@vampaz/webmcp-kit:${provider}:api-key`
}

async function getServerResolverError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string }
    if (payload.error) return `server resolver returned ${response.status}: ${payload.error}`
  } catch {
    return `server resolver returned ${response.status}`
  }

  return `server resolver returned ${response.status}`
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return
  throw new Error('Resolver request was cancelled.')
}
