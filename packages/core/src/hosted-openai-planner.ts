import type {
  PlannerContext,
  PlannerRunOptions,
  ToolPlan,
  ToolPlanner,
  WebMCPTool
} from './interfaces/tool'
import { getErrorMessage } from './confirmation'
import { toolPlanSchema, validateToolPlan } from './plan-validation'

export interface HostedOpenAIPlannerOptions {
  accessKey?: string
  browserChallengeSiteKey?: string
  endpoint: string
  model: string
  sessionEndpoint?: string
}

interface PaidAccessSession {
  expiresAt: string
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

const hostedOpenAIPlannerServiceId = 'hosted-openai-planner'
const turnstileScriptSrc = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const sessionRefreshSkewMs = 30 * 1000
let turnstileScriptPromise: Promise<void> | undefined

export function createHostedOpenAIPlanner(options: HostedOpenAIPlannerOptions): ToolPlanner {
  if (!options.accessKey) {
    return {
      available: false,
      detail:
        'Hosted OpenAI needs a WebMCP publishable key. Other local and app-owned planners remain available.',
      name: 'Hosted OpenAI',
      status: 'needs-key',
      async plan() {
        throw new Error('Hosted OpenAI needs a WebMCP publishable key.')
      }
    }
  }

  let paidAccessSession: PaidAccessSession | null = null

  return {
    available: true,
    detail: 'Hosted OpenAI will plan through the WebMCP paid endpoint.',
    name: 'Hosted OpenAI',
    status: 'ready',
    async plan(
      message: string,
      tools: WebMCPTool[],
      context: PlannerContext = {},
      runOptions?: PlannerRunOptions
    ) {
      paidAccessSession = await getPaidAccessSession(options, paidAccessSession, runOptions?.signal)
      const response = await requestHostedPlan({
        context,
        message,
        options,
        signal: runOptions?.signal,
        tools,
        token: paidAccessSession.token
      })

      if (response.status === 403) {
        paidAccessSession = null
      }

      if (!response.ok) {
        throw new Error(await getHostedPlannerError(response))
      }

      const plan = (await response.json()) as ToolPlan
      validateToolPlan(plan, tools)
      return plan
    }
  }
}

async function requestHostedPlan(input: {
  context: PlannerContext
  message: string
  options: HostedOpenAIPlannerOptions
  signal?: AbortSignal
  token: string
  tools: WebMCPTool[]
}): Promise<Response> {
  return fetch(input.options.endpoint, {
    body: JSON.stringify({
      context: input.context,
      message: input.message,
      model: input.options.model,
      provider: 'openai',
      responseSchema: toolPlanSchema,
      tools: createHostedToolCatalog(input.tools)
    }),
    headers: {
      Authorization: `Bearer ${input.token}`,
      'Content-Type': 'application/json'
    },
    method: 'POST',
    signal: input.signal
  })
}

async function getPaidAccessSession(
  options: HostedOpenAIPlannerOptions,
  currentSession: PaidAccessSession | null,
  signal?: AbortSignal
): Promise<PaidAccessSession> {
  if (currentSession && isPaidAccessSessionFresh(currentSession)) return currentSession

  const turnstileToken = await getBrowserChallengeToken(options)
  const response = await fetch(options.sessionEndpoint ?? '/api/webmcp/session', {
    body: JSON.stringify({
      accessKey: options.accessKey,
      model: options.model,
      serviceId: hostedOpenAIPlannerServiceId,
      turnstileToken
    }),
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'POST',
    signal
  })

  if (!response.ok) {
    throw new Error(await getHostedPlannerError(response))
  }

  return (await response.json()) as PaidAccessSession
}

async function getBrowserChallengeToken(
  options: HostedOpenAIPlannerOptions
): Promise<string | undefined> {
  if (typeof window === 'undefined') return undefined
  const providedToken = await window.webmcpCreateTurnstileToken?.({
    model: options.model,
    serviceId: hostedOpenAIPlannerServiceId
  })
  if (providedToken) return providedToken

  const siteKey = options.browserChallengeSiteKey ?? getTurnstileSiteKey()
  if (!siteKey) return undefined

  return createTurnstileToken(siteKey)
}

function isPaidAccessSessionFresh(session: PaidAccessSession): boolean {
  return Date.parse(session.expiresAt) - sessionRefreshSkewMs > Date.now()
}

async function createTurnstileToken(siteKey: string): Promise<string> {
  await loadTurnstileScript()

  return new Promise(function createToken(resolve, reject) {
    const container = document.createElement('div')
    container.hidden = true
    document.body.append(container)

    let widgetId = ''
    function cleanup() {
      if (widgetId) window.turnstile?.remove?.(widgetId)
      container.remove()
    }

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

async function getHostedPlannerError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string }
    if (payload.error) return `Hosted OpenAI returned ${response.status}: ${payload.error}`
  } catch (error) {
    return `Hosted OpenAI returned ${response.status}: ${getErrorMessage(error)}`
  }

  return `Hosted OpenAI returned ${response.status}`
}
