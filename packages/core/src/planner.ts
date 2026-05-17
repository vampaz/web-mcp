import type {
  PlannerAuth,
  PlannerContext,
  PlannerProviderConfig,
  ToolPlan,
  ToolPlanner,
  WebMCPTool
} from './interfaces/tool'
import { formatJsonValueValidationError, validateJsonValue } from './schema'

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

const toolPlanSchema = {
  type: 'object',
  properties: {
    toolName: { type: 'string' },
    input: { type: 'object' },
    confidence: { type: 'number' },
    reason: { type: 'string' }
  },
  required: ['toolName', 'input', 'confidence', 'reason'],
  additionalProperties: false
}

const numberWords = new Map([
  ['one', 1],
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10],
  ['eleven', 11],
  ['twelve', 12],
  ['thirteen', 13],
  ['fourteen', 14],
  ['fifteen', 15],
  ['sixteen', 16],
  ['seventeen', 17],
  ['eighteen', 18],
  ['nineteen', 19],
  ['twenty', 20]
])

export function createHeuristicPlanner(): ToolPlanner {
  return {
    name: 'Local heuristic planner',
    available: true,
    status: 'fallback',
    detail: 'Chrome built-in AI is unavailable, so WebMCP Kit is using deterministic local planning.',
    async plan(message: string, tools: WebMCPTool[], context?: PlannerContext) {
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
      async plan(message: string, tools: WebMCPTool[], context?: PlannerContext) {
        if (strict) throw new Error('Chrome built-in AI is unavailable.')
        return planWithHeuristics(message, tools, context)
      }
    }
  }

  try {
    const availability = await languageModel.availability(chromeAITextOptions)
    if (availability === 'unavailable') {
      return createUnavailableChromePlanner('Chrome reports that built-in AI is unavailable in this environment.', strict)
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
    return createUnavailableChromePlanner('Chrome built-in AI could not create a planning session.', strict)
  }
}

export async function createBestPlanner(): Promise<ToolPlanner> {
  const chromePlanner = await createChromeAIPlanner()
  if (chromePlanner.available) return chromePlanner

  return createHeuristicPlanner()
}

export async function createConfiguredPlanner(config?: PlannerProviderConfig): Promise<ToolPlanner> {
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
      detail: `${providerLabel} needs server endpoint mode so the browser talks to a local or preview Worker with an AI binding.`,
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
    async plan(message: string, tools: WebMCPTool[], context: PlannerContext = {}) {
      try {
        const plan = await planWithRemoteProvider(config, auth, key, model, message, tools, context)
        validateRemotePlan(plan, tools)
        return plan
      } catch (error) {
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
  const response = await session.prompt(createPlannerPrompt(message, tools, context), { responseConstraint: toolPlanSchema })

  return parseToolPlanJson(response, 'Chrome built-in AI')
}

function createChromeAISession(languageModel: LanguageModelApi): Promise<LanguageModelSession> {
  return languageModel.create({
    ...chromeAITextOptions,
    initialPrompts: [
      {
        role: 'system',
        content: 'Choose exactly one app tool for the user request. Return only JSON matching the requested schema.'
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
  context: PlannerContext
): Promise<ToolPlan> {
  if (auth.mode === 'server') {
    return planWithServerEndpoint(auth.endpoint, config, model, message, tools, context)
  }

  if (config.provider === 'cloudflare-workers-ai') {
    return planWithCloudflareRest(config, apiKey, model, message, tools, context)
  }

  return planWithOpenAICompatible(config, apiKey, model, message, tools, context)
}

async function planWithServerEndpoint(
  endpoint: string,
  config: PlannerProviderConfig,
  model: string,
  message: string,
  tools: WebMCPTool[],
  context: PlannerContext
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
    })
  })

  if (!response.ok) {
    throw new Error(await getServerPlannerError(response))
  }

  return await response.json() as ToolPlan
}

async function planWithOpenAICompatible(
  config: PlannerProviderConfig,
  apiKey: string | undefined,
  model: string,
  message: string,
  tools: WebMCPTool[],
  context: PlannerContext
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
    })
  })

  if (!response.ok) {
    throw new Error(`${getProviderLabel(config)} returned ${response.status}`)
  }

  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error('provider returned no message content')

  return parseToolPlanJson(content, getProviderLabel(config))
}

async function planWithCloudflareRest(
  config: PlannerProviderConfig,
  apiKey: string | undefined,
  model: string,
  message: string,
  tools: WebMCPTool[],
  context: PlannerContext
): Promise<ToolPlan> {
  if (!config.accountId) {
    throw new Error('Cloudflare REST planning needs accountId or server endpoint mode')
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${model}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages: createPlannerMessages(message, tools, context),
      response_format: {
        type: 'json_schema',
        json_schema: toolPlanSchema
      },
      temperature: 0
    })
  })

  if (!response.ok) {
    throw new Error(`Cloudflare Workers AI returned ${response.status}`)
  }

  const payload = await response.json() as { result?: { response?: string } }
  const content = payload.result?.response
  if (!content) throw new Error('Cloudflare returned no response content')

  return parseToolPlanJson(content, 'Cloudflare Workers AI')
}

function createPlannerMessages(message: string, tools: WebMCPTool[], context: PlannerContext) {
  return [
    {
      role: 'system',
      content: 'Choose exactly one app tool for the user request. Return only JSON with toolName, input, confidence, and reason.'
    },
    {
      role: 'user',
      content: createPlannerPrompt(message, tools, context)
    }
  ]
}

function createPlannerPrompt(message: string, tools: WebMCPTool[], context: PlannerContext): string {
  return [
    `User request: ${message}`,
    `Current app context:\n${JSON.stringify(context, null, 2)}`,
    `Available tools:\n${JSON.stringify(createToolCatalog(tools), null, 2)}`,
    'Choose the best tool and exact parameters from the current app context. Prefer stable IDs from context over labels.',
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

function planWithHeuristics(message: string, tools: WebMCPTool[], context: PlannerContext = {}): ToolPlan {
  const normalizedMessage = message.toLowerCase()

  if (normalizedMessage.includes('invoice') && normalizedMessage.includes('sort') && hasTool(tools, 'sort_invoices')) {
    return {
      toolName: 'sort_invoices',
      input: {
        sortBy: normalizedMessage.includes('amount') ? 'amount' : normalizedMessage.includes('customer') ? 'customerName' : 'dueDate',
        direction: normalizedMessage.includes('desc') || normalizedMessage.includes('highest') ? 'desc' : 'asc'
      },
      confidence: 0.7,
      reason: 'Matched invoice table sorting wording.'
    }
  }

  if (normalizedMessage.includes('invoice') && normalizedMessage.includes('open') && hasTool(tools, 'open_invoice')) {
    return {
      toolName: 'open_invoice',
      input: {
        id: getMatchingInvoiceIds(normalizedMessage, context)[0] ?? getFirstInvoiceId(context)
      },
      confidence: 0.68,
      reason: 'Matched invoice drawer open wording.'
    }
  }

  if (normalizedMessage.includes('invoice') && normalizedMessage.includes('select') && hasTool(tools, 'select_invoices')) {
    return {
      toolName: 'select_invoices',
      input: {
        ids: getMatchingInvoiceIds(normalizedMessage, context)
      },
      confidence: 0.72,
      reason: 'Matched invoice row selection wording against current invoice context.'
    }
  }

  if (normalizedMessage.includes('invoice') && (normalizedMessage.includes('filter') || normalizedMessage.includes('show')) && hasTool(tools, 'filter_invoices')) {
    return {
      toolName: 'filter_invoices',
      input: {
        status: getInvoiceStatusFromMessage(normalizedMessage),
        minAmount: messageRequestsMinimumAmount(normalizedMessage) ? extractAmount(message) : undefined
      },
      confidence: 0.7,
      reason: 'Matched invoice table filter wording.'
    }
  }

  if (normalizedMessage.includes('invoice') && (normalizedMessage.includes('mark') || normalizedMessage.includes('status')) && hasTool(tools, 'update_selected_invoice_status')) {
    return {
      toolName: 'update_selected_invoice_status',
      input: {
        status: getInvoiceStatusFromMessage(normalizedMessage)
      },
      confidence: 0.68,
      reason: 'Matched invoice status mutation wording.'
    }
  }

  if (normalizedMessage.includes('invoice')) {
    return {
      toolName: pickToolName(tools, 'create_invoice'),
      input: {
        customerName: extractCustomerName(message),
        amount: extractAmount(message)
      },
      confidence: 0.72,
      reason: 'Matched invoice wording and extracted an amount if present.'
    }
  }

  if (normalizedMessage.includes('checkout') || normalizedMessage.includes('check out')) {
    return {
      toolName: pickToolName(tools, 'checkout_cart'),
      input: {},
      confidence: 0.7,
      reason: 'Matched checkout wording for a confirmed cart mutation.'
    }
  }

  if (normalizedMessage.includes('cart') || normalizedMessage.includes('card') || normalizedMessage.includes('add ')) {
    return {
      toolName: pickToolName(tools, 'add_to_cart'),
      input: {
        productId: normalizedMessage.includes('keyboard') ? 'kbd-01' : 'dock-02',
        quantity: extractQuantity(message)
      },
      confidence: 0.68,
      reason: 'Matched add-to-cart wording and extracted quantity when present.'
    }
  }

  if (normalizedMessage.includes('select') && normalizedMessage.includes('first')) {
    return {
      toolName: pickToolName(tools, 'select_items'),
      input: {
        ids: getFirstContextItemIds(context, extractQuantity(message))
      },
      confidence: 0.7,
      reason: 'Fallback selected the first visible checklist item IDs from context.'
    }
  }

  if (normalizedMessage.includes('clear') && normalizedMessage.includes('selection')) {
    return {
      toolName: pickToolName(tools, 'clear_item_selection'),
      input: {},
      confidence: 0.7,
      reason: 'Matched checklist clear-selection wording.'
    }
  }

  if (normalizedMessage.includes('select') && hasTool(tools, 'select_items')) {
    const ids = getSemanticContextItemIds(normalizedMessage, context)
    if (ids.length > 0) {
      return {
        toolName: 'select_items',
        input: {
          ids
        },
        confidence: 0.64,
        reason: 'Matched visible checklist item metadata from the current app context.'
      }
    }
  }

  if (normalizedMessage.includes('select') && hasTool(tools, 'select_items')) {
    return {
      toolName: 'select_items',
      input: {
        ids: []
      },
      confidence: 0.2,
      reason: 'Fallback planner cannot infer semantic checklist selection. Chrome built-in AI needs to choose IDs from the current app context.'
    }
  }

  if (normalizedMessage.includes('support') || normalizedMessage.includes('ticket') || normalizedMessage.includes('help')) {
    return {
      toolName: pickToolName(tools, 'create_support_ticket'),
      input: {
        subject: 'Help request',
        body: message
      },
      confidence: 0.66,
      reason: 'Matched support-ticket wording.'
    }
  }

  return {
    toolName: pickToolName(tools, 'search_products'),
    input: {
      query: message.replace(/search|find|for/gi, '').trim() || message
    },
    confidence: 0.58,
    reason: 'Defaulted to product search for exploratory wording.'
  }
}

function pickToolName(tools: WebMCPTool[], preferredName: string): string {
  return tools.find((tool) => tool.name === preferredName)?.name ?? tools[0]?.name ?? preferredName
}

function hasTool(tools: WebMCPTool[], preferredName: string): boolean {
  return tools.some((tool) => tool.name === preferredName)
}

function extractAmount(message: string): number {
  const amount = message.match(/(?:€|\$)?\s*(\d+(?:[.,]\d+)?)/)?.[1]
  if (!amount) return 100

  return Number(amount.replace(',', '.'))
}

function extractQuantity(message: string): number {
  const numericQuantity = message.match(/\b(\d+)\b/)?.[1]
  if (numericQuantity) return Number(numericQuantity)

  const normalizedMessage = message.toLowerCase()
  for (const [word, value] of numberWords) {
    if (new RegExp(`\\b${word}\\b`).test(normalizedMessage)) {
      return value
    }
  }

  return 1
}

function extractCustomerName(message: string): string {
  const match = message.match(/(?:for|to)\s+([A-Z][\w\s-]{1,40})(?:\s+(?:for|with|at|of)\s+|$)/)
  return match?.[1]?.trim() ?? 'Acme Corp'
}

function getFirstContextItemIds(context: PlannerContext, count: number): string[] {
  const items = Array.isArray(context.checklistItems) ? context.checklistItems : []
  return items
    .slice(0, count)
    .map((item) => getContextItemId(item))
    .filter((id): id is string => Boolean(id))
}

function getSemanticContextItemIds(normalizedMessage: string, context: PlannerContext): string[] {
  const items = Array.isArray(context.checklistItems) ? context.checklistItems : []
  const terms = getChecklistSelectionTerms(normalizedMessage)
  if (terms.length === 0) return []

  return items
    .filter(function itemMatchesTerms(item) {
      const searchableText = getContextItemSearchableText(item)
      return terms.every(function hasTerm(term) {
        return termMatchesText(term, searchableText)
      })
    })
    .map(function mapItemId(item) {
      return getContextItemId(item)
    })
    .filter((id): id is string => Boolean(id))
}

function getMatchingInvoiceIds(normalizedMessage: string, context: PlannerContext): string[] {
  const invoices = Array.isArray(context.invoices) ? context.invoices : []
  const status = getInvoiceStatusFromMessage(normalizedMessage)
  const wantsUnpaid = messageRequestsUnpaid(normalizedMessage)
  return invoices
    .filter(function invoiceMatches(invoice) {
      if (!invoice || typeof invoice !== 'object') return false
      const record = invoice as Record<string, unknown>
      const searchableText = `${record.customerName ?? ''} ${record.owner ?? ''} ${record.status ?? ''} ${record.id ?? ''}`.toLowerCase()
      const matchesStatus = wantsUnpaid
        ? record.status !== 'paid' && record.status !== 'void'
        : status === 'all' || record.status === status
      const matchesAmount = messageRequestsMinimumAmount(normalizedMessage) && typeof record.amount === 'number'
        ? record.amount >= extractAmount(normalizedMessage)
        : true
      return matchesStatus && matchesAmount && normalizedMessage.split(/\W+/).every(function hasTerm(term) {
        if (isIgnoredInvoiceTerm(term)) return true
        return searchableText.includes(term)
      })
    })
    .map((invoice) => getContextItemId(invoice))
    .filter((id): id is string => Boolean(id))
}

function getFirstInvoiceId(context: PlannerContext): string {
  const invoices = Array.isArray(context.invoices) ? context.invoices : []
  return getContextItemId(invoices[0]) ?? ''
}

function getInvoiceStatusFromMessage(normalizedMessage: string): string {
  if (messageRequestsUnpaid(normalizedMessage)) return 'all'
  if (normalizedMessage.includes('overdue')) return 'overdue'
  if (/\bpaid\b/.test(normalizedMessage)) return 'paid'
  if (normalizedMessage.includes('sent')) return 'sent'
  if (normalizedMessage.includes('draft')) return 'draft'
  if (normalizedMessage.includes('void')) return 'void'
  return 'all'
}

function messageRequestsUnpaid(normalizedMessage: string): boolean {
  return /\bunpaid\b/.test(normalizedMessage) || normalizedMessage.includes('not paid')
}

function messageRequestsMinimumAmount(normalizedMessage: string): boolean {
  return normalizedMessage.includes('over')
    || normalizedMessage.includes('above')
    || normalizedMessage.includes('greater than')
    || normalizedMessage.includes('more than')
    || normalizedMessage.includes('at least')
}

function isIgnoredInvoiceTerm(term: string): boolean {
  return term.length <= 2
    || /^\d+$/.test(term)
    || [
      'all',
      'above',
      'amount',
      'are',
      'at',
      'greater',
      'invoice',
      'invoices',
      'least',
      'more',
      'not',
      'open',
      'over',
      'select',
      'show',
      'than',
      'that',
      'the',
      'unpaid',
      'with'
    ].includes(term)
}

function getChecklistSelectionTerms(normalizedMessage: string): string[] {
  return normalizedMessage
    .split(/\W+/)
    .filter(function keepChecklistTerm(term) {
      return term.length > 2 && ![
        'all',
        'and',
        'are',
        'for',
        'item',
        'items',
        'one',
        'ones',
        'select',
        'that',
        'the',
        'those',
        'with'
      ].includes(term)
    })
}

function getContextItemSearchableText(item: unknown): string {
  if (!item || typeof item !== 'object') return ''
  const record = item as Record<string, unknown>
  const name = record.name
  if (typeof name !== 'string') return ''

  return [name, ...getInferredChecklistTerms(name)].join(' ').toLowerCase()
}

function getInferredChecklistTerms(name: string): string[] {
  const normalizedName = name.toLowerCase()
  const terms: string[] = []

  if (['apple', 'banana', 'orange', 'lemon', 'grapefruit'].includes(normalizedName)) {
    terms.push('fruit')
  }

  if (['water', 'sparkling water', 'coffee', 'milk', 'tea'].includes(normalizedName)) {
    terms.push('liquid', 'drink', 'beverage')
  }

  if (['croissant', 'baguette', 'brie', 'pain au chocolat', 'quiche'].includes(normalizedName)) {
    terms.push('french')
  }

  if (['rice', 'almonds'].includes(normalizedName)) {
    terms.push('pantry')
  }

  if (['carrot', 'beetroot', 'potato', 'radish', 'turnip'].includes(normalizedName)) {
    terms.push('root', 'vegetable')
  }

  return terms
}

function termMatchesText(term: string, searchableText: string): boolean {
  if (searchableText.includes(term)) return true
  if (term.endsWith('s') && searchableText.includes(term.slice(0, -1))) return true
  return !term.endsWith('s') && searchableText.includes(`${term}s`)
}

function getContextItemId(item: unknown): string | undefined {
  if (!item || typeof item !== 'object' || !('id' in item)) return undefined

  const id = (item as { id: unknown }).id
  return typeof id === 'string' ? id : undefined
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
    async plan(message: string, tools: WebMCPTool[], context?: PlannerContext) {
      try {
        session ??= await createChromeAISession(languageModel)
        return await planWithChromeAI(session, message, tools, context)
      } catch (error) {
        if (strict) throw new Error(`Chrome built-in AI could not plan this command (${getErrorMessage(error)})`)

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
    return JSON.parse(normalizeJsonText(value)) as ToolPlan
  } catch {
    throw new Error(`${source} returned unparseable JSON`)
  }
}

function normalizeJsonText(value: string): string {
  const trimmedValue = value.trim()
  if (!trimmedValue) throw new Error('empty JSON')

  const fencedMatch = trimmedValue.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fencedMatch?.[1]) return fencedMatch[1].trim()

  const firstBraceIndex = trimmedValue.indexOf('{')
  const lastBraceIndex = trimmedValue.lastIndexOf('}')
  if (firstBraceIndex !== -1 && lastBraceIndex > firstBraceIndex) {
    return trimmedValue.slice(firstBraceIndex, lastBraceIndex + 1)
  }

  return trimmedValue
}

function createUnavailableChromePlanner(detail: string, strict = false): ToolPlanner {
  return {
    name: 'Chrome built-in AI',
    available: false,
    status: 'unavailable',
    detail,
    async plan(message: string, tools: WebMCPTool[], context?: PlannerContext) {
      if (strict) throw new Error(detail)
      return planWithHeuristics(message, tools, context)
    }
  }
}

function validateRemotePlan(plan: ToolPlan, tools: WebMCPTool[]): void {
  if (!plan || typeof plan !== 'object') throw new Error('provider returned an invalid plan')
  if (typeof plan.toolName !== 'string') throw new Error('provider returned a plan without toolName')
  if (!plan.input || typeof plan.input !== 'object' || Array.isArray(plan.input)) throw new Error('provider returned a plan with invalid input')
  if (typeof plan.confidence !== 'number') throw new Error('provider returned a plan without numeric confidence')
  if (typeof plan.reason !== 'string') throw new Error('provider returned a plan without reason')
  const selectedTool = tools.find((tool) => tool.name === plan.toolName)
  if (!selectedTool) throw new Error(`provider selected unknown tool "${plan.toolName}"`)

  const inputValidationErrors = validateJsonValue(plan.input, selectedTool.inputSchema)
  if (inputValidationErrors.length > 0) {
    throw new Error(`provider returned invalid input for "${plan.toolName}": ${formatJsonValueValidationError(inputValidationErrors)}`)
  }
}

function getPlannerApiKey(provider: PlannerProviderConfig['provider'], auth: PlannerAuth): string | undefined {
  if (auth.mode !== 'user-key') return undefined
  if (auth.apiKey) return auth.apiKey
  if (typeof localStorage === 'undefined') return undefined

  const storageKey = auth.storageKey ?? getDefaultStorageKey(provider)
  return localStorage.getItem(storageKey) ?? undefined
}

function requiresBrowserKey(config: PlannerProviderConfig, auth: PlannerAuth): boolean {
  return auth.mode === 'user-key'
    && config.provider !== 'chrome-built-in'
    && config.provider !== 'local'
    && config.provider !== 'cloudflare-binding'
}

function requiresServerBinding(config: PlannerProviderConfig, auth: PlannerAuth): boolean {
  return config.provider === 'cloudflare-binding' && auth.mode !== 'server'
}

function getRemotePlannerDetail(config: PlannerProviderConfig, auth: PlannerAuth): string {
  const provider = getProviderLabel(config)
  if (config.provider === 'cloudflare-binding') return `${provider} will plan through ${auth.mode === 'server' ? auth.endpoint : 'a server endpoint'} using a local or preview Cloudflare AI binding.`
  if (auth.mode === 'server') return `${provider} will plan through ${auth.endpoint}; provider secrets stay server-side.`
  if (auth.mode === 'user-key') return `${provider} will plan directly from the browser with a user-provided key. This is convenient but the key is visible to this page.`
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
  if (config.provider === 'openai') return 'gpt-4.1-mini'
  if (config.provider === 'cloudflare-binding') return '@cf/google/gemma-4-26b-a4b-it'
  if (config.provider === 'cloudflare-workers-ai') return '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b'

  return 'default'
}

function getProviderLabel(config: PlannerProviderConfig): string {
  if (config.provider === 'openrouter') return 'OpenRouter'
  if (config.provider === 'openai') return 'OpenAI'
  if (config.provider === 'openai-compatible') return 'OpenAI-compatible provider'
  if (config.provider === 'cloudflare-binding') return 'Cloudflare binding'
  if (config.provider === 'cloudflare-workers-ai') return 'Cloudflare Workers AI'
  if (config.provider === 'chrome-built-in') return 'Chrome built-in AI'
  if (config.provider === 'local') return 'Local heuristic planner'

  return 'Planner'
}

function getDefaultStorageKey(provider: PlannerProviderConfig['provider']): string {
  return `webmcp-kit:${provider}:api-key`
}

async function getServerPlannerError(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: string }
    if (payload.error) return `server planner returned ${response.status}: ${payload.error}`
  } catch {
    return `server planner returned ${response.status}`
  }

  return `server planner returned ${response.status}`
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'unknown error'
}
