import type {
  ResolverContext,
  ResolverRunOptions,
  ToolResolution,
  ToolResolver,
  WebMCPTool
} from './interfaces/tool'
import type {
  WebMCPCommandInputResolverModelOption,
  WebMCPCommandInputResolverOption
} from './interfaces/command-input'
import { getErrorMessage } from './confirmation'
import { createToolResolutionSchema, validateToolResolution } from './resolution-validation'
import { serializeResolverRequest } from './resolver-request'

export interface HostedOpenAIResolverOptions {
  accessKey?: string
  baseUrl?: string
  browserChallengeSiteKey?: string
  endpoint?: string
  model: string
  sessionEndpoint?: string
}

interface ResolvedHostedOpenAIResolverOptions extends HostedOpenAIResolverOptions {
  endpoint: string
  sessionEndpoint: string
}

interface PaidAccessSession {
  expiresAt?: string
  token: string
  tokenType: 'Bearer'
}

interface BrowserChallengeTokenInput {
  model: string
  serviceId: string
}

type BrowserChallengeTokenProvider = (
  input: BrowserChallengeTokenInput
) => Promise<string | undefined> | string | undefined

declare global {
  interface Window {
    turnstile?: TurnstileApi
    webmcpCreateTurnstileToken?: BrowserChallengeTokenProvider
  }
}

interface TurnstileApi {
  execute: (widgetId: string) => void
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string
  remove?: (widgetId: string) => void
  reset: (widgetId: string) => void
}

interface TurnstileRenderOptions {
  'error-callback': () => void
  'expired-callback': () => void
  callback: (token: string) => void
  execution: 'execute'
  sitekey: string
  size: 'invisible'
}

const hostedOpenAIResolverServiceId = 'hosted-openai-resolver'
const turnstileScriptSrc = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const sessionRefreshSkewMs = 30 * 1000
const defaultResolverEndpointPath = '/api/webmcp/resolve'
const defaultSessionEndpointPath = '/api/webmcp/session'
let turnstileScriptPromise: Promise<void> | undefined

export function createHostedOpenAIResolver(rawOptions: HostedOpenAIResolverOptions): ToolResolver {
  const options = resolveHostedOpenAIResolverOptions(rawOptions)
  if (!options.accessKey) {
    return {
      available: false,
      detail:
        'Hosted OpenAI needs a WebMCP publishable key. Other local and app-owned resolvers remain available.',
      name: 'Hosted OpenAI',
      status: 'needs-key',
      async resolve() {
        throw new Error('Hosted OpenAI needs a WebMCP publishable key.')
      }
    }
  }

  let paidAccessSession: PaidAccessSession | null = null

  return {
    capabilities: { conversation: true },
    available: true,
    detail: 'Hosted OpenAI will resolve through the WebMCP paid endpoint.',
    name: 'Hosted OpenAI',
    status: 'ready',
    async resolve(
      message: string,
      tools: WebMCPTool[],
      context: ResolverContext = {},
      runOptions?: ResolverRunOptions
    ) {
      runOptions?.signal?.throwIfAborted()
      const body = serializeResolverRequest(
        {
          context,
          message,
          model: options.model,
          provider: 'openai',
          responseSchema: createToolResolutionSchema(
            tools,
            runOptions?.singleStep,
            runOptions?.purpose
          ),
          ...(runOptions?.singleStep || runOptions?.purpose === 'summary'
            ? { singleStep: true }
            : {}),
          ...(runOptions?.purpose ? { purpose: runOptions.purpose } : {}),
          tools: createHostedToolCatalog(tools)
        },
        runOptions?.maxRequestBytes
      )
      paidAccessSession = await getPaidAccessSession(options, paidAccessSession, runOptions?.signal)
      const response = await requestHostedResolution({
        body,
        options,
        signal: runOptions?.signal,
        token: paidAccessSession.token
      })

      if (response.status === 401 || response.status === 403) {
        paidAccessSession = null
      }

      if (!response.ok) {
        throw new Error(await getHostedResolverError(response))
      }

      const resolution = (await response.json()) as ToolResolution
      runOptions?.signal?.throwIfAborted()
      validateToolResolution(resolution, tools, runOptions)
      return resolution
    }
  }
}

export interface HostedOpenAIResolverOptionConfig {
  accessKey?: string
  baseUrl?: string
  browserChallengeSiteKey?: string
  endpoint?: string
  id?: string
  label?: string
  model?: string
  modelOptions?: WebMCPCommandInputResolverModelOption[]
  sessionEndpoint?: string
}

export function createHostedOpenAIResolverOption(
  config: HostedOpenAIResolverOptionConfig
): WebMCPCommandInputResolverOption {
  return {
    id: config.id ?? 'hosted-openai',
    label: config.label ?? 'Hosted OpenAI',
    modelOptions: config.modelOptions,
    createResolver(options) {
      const model = options?.model ?? config.model ?? config.modelOptions?.[0]?.model
      if (!model) {
        throw new Error(
          'Hosted OpenAI resolver option needs a model: pass "model" or a non-empty "modelOptions".'
        )
      }

      return createHostedOpenAIResolver({
        accessKey: config.accessKey,
        baseUrl: config.baseUrl,
        browserChallengeSiteKey: config.browserChallengeSiteKey,
        endpoint: config.endpoint,
        model,
        sessionEndpoint: config.sessionEndpoint
      })
    }
  }
}

function resolveHostedOpenAIResolverOptions(
  options: HostedOpenAIResolverOptions
): ResolvedHostedOpenAIResolverOptions {
  return {
    ...options,
    endpoint: resolveHostedEndpoint(options.baseUrl, options.endpoint, defaultResolverEndpointPath),
    sessionEndpoint: resolveHostedEndpoint(
      options.baseUrl,
      options.sessionEndpoint,
      defaultSessionEndpointPath
    )
  }
}

function resolveHostedEndpoint(
  baseUrl: string | undefined,
  explicitEndpoint: string | undefined,
  defaultPath: string
): string {
  if (explicitEndpoint) return explicitEndpoint
  if (!baseUrl) return defaultPath

  return `${baseUrl.replace(/\/+$/, '')}${defaultPath}`
}

async function requestHostedResolution(input: {
  body: string
  options: ResolvedHostedOpenAIResolverOptions
  signal?: AbortSignal
  token: string
}): Promise<Response> {
  return fetch(input.options.endpoint, {
    body: input.body,
    headers: {
      Authorization: `Bearer ${input.token}`,
      'Content-Type': 'application/json'
    },
    method: 'POST',
    signal: input.signal
  })
}

async function getPaidAccessSession(
  options: ResolvedHostedOpenAIResolverOptions,
  currentSession: PaidAccessSession | null,
  signal?: AbortSignal
): Promise<PaidAccessSession> {
  signal?.throwIfAborted()
  if (currentSession && isPaidAccessSessionFresh(currentSession)) return currentSession

  const turnstileToken = await getBrowserChallengeToken(options, signal)
  const response = await fetch(options.sessionEndpoint, {
    body: JSON.stringify({
      accessKey: options.accessKey,
      model: options.model,
      serviceId: hostedOpenAIResolverServiceId,
      turnstileToken
    }),
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'POST',
    signal
  })

  if (!response.ok) {
    throw new Error(await getHostedResolverError(response))
  }

  return (await response.json()) as PaidAccessSession
}

async function getBrowserChallengeToken(
  options: HostedOpenAIResolverOptions,
  signal?: AbortSignal
): Promise<string | undefined> {
  if (typeof window === 'undefined') return undefined
  const providedToken = await waitForChallenge(
    Promise.resolve(
      window.webmcpCreateTurnstileToken?.({
        model: options.model,
        serviceId: hostedOpenAIResolverServiceId
      })
    ),
    signal
  )
  if (providedToken) return providedToken

  const siteKey = options.browserChallengeSiteKey ?? getTurnstileSiteKey()
  if (!siteKey) return undefined

  return createTurnstileToken(siteKey, signal)
}

function isPaidAccessSessionFresh(session: PaidAccessSession): boolean {
  if (!session.expiresAt) return true
  return Date.parse(session.expiresAt) - sessionRefreshSkewMs > Date.now()
}

async function createTurnstileToken(siteKey: string, signal?: AbortSignal): Promise<string> {
  await waitForChallenge(loadTurnstileScript(), signal)
  signal?.throwIfAborted()

  return new Promise(function createToken(resolve, reject) {
    const container = document.createElement('div')
    container.hidden = true
    document.body.append(container)

    let widgetId = ''
    function cleanup() {
      signal?.removeEventListener('abort', abort)
      if (widgetId) window.turnstile?.remove?.(widgetId)
      container.remove()
    }
    function abort() {
      cleanup()
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', abort, { once: true })

    try {
      widgetId =
        window.turnstile?.render(container, {
          'error-callback': function handleError() {
            cleanup()
            reject(new Error('Browser challenge failed.'))
          },
          'expired-callback': function handleExpired() {
            cleanup()
            reject(new Error('Browser challenge expired.'))
          },
          callback: function handleToken(token) {
            cleanup()
            resolve(token)
          },
          execution: 'execute',
          sitekey: siteKey,
          size: 'invisible'
        }) ?? ''

      if (!widgetId) {
        cleanup()
        reject(new Error('Browser challenge is unavailable.'))
        return
      }

      window.turnstile?.execute(widgetId)
    } catch (error) {
      cleanup()
      reject(error)
    }
  })
}

function waitForChallenge<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending
  return new Promise(function wait(resolve, reject) {
    function abort() {
      reject(signal!.reason)
    }
    signal!.addEventListener('abort', abort, { once: true })
    pending.then(resolve, reject).finally(function cleanup() {
      signal!.removeEventListener('abort', abort)
    })
    if (signal!.aborted) abort()
  })
}

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (turnstileScriptPromise) return turnstileScriptPromise

  turnstileScriptPromise = new Promise(function loadScript(resolve, reject) {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${turnstileScriptSrc}"]`
    )
    if (existingScript) {
      existingScript.addEventListener('load', function handleLoad() {
        resolve()
      })
      existingScript.addEventListener('error', function handleError() {
        existingScript.remove()
        turnstileScriptPromise = undefined
        reject(new Error('Browser challenge script failed to load.'))
      })
      return
    }

    const script = document.createElement('script')
    script.async = true
    script.defer = true
    script.src = turnstileScriptSrc
    script.addEventListener('load', function handleLoad() {
      resolve()
    })
    script.addEventListener('error', function handleError() {
      script.remove()
      turnstileScriptPromise = undefined
      reject(new Error('Browser challenge script failed to load.'))
    })
    document.head.append(script)
  })

  return turnstileScriptPromise
}

function getTurnstileSiteKey(): string {
  if (typeof document === 'undefined') return ''

  return (
    document.querySelector<HTMLMetaElement>('meta[name="webmcp-turnstile-site-key"]')?.content ?? ''
  )
}

function createHostedToolCatalog(tools: WebMCPTool[]) {
  return tools.map(function mapTool(tool) {
    return {
      description: tool.description,
      inputSchema: tool.inputSchema,
      name: tool.name
    }
  })
}

async function getHostedResolverError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string }
    if (payload.error) return `Hosted OpenAI returned ${response.status}: ${payload.error}`
  } catch (error) {
    return `Hosted OpenAI returned ${response.status}: ${getErrorMessage(error)}`
  }

  return `Hosted OpenAI returned ${response.status}`
}
