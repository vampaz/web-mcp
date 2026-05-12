import type { ToolPlan, ToolPlanner, WebMCPTool } from './interfaces/tool'

interface LanguageModelSession {
  prompt: (message: string, options?: ChromeAIPromptOptions) => Promise<string>
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
  expectedOutputs: [
    {
      type: 'text',
      languages: ['en']
    }
  ]
} satisfies ChromeAIOptions

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
    async plan(message: string, tools: WebMCPTool[]) {
      return planWithHeuristics(message, tools)
    }
  }
}

export async function createChromeAIPlanner(): Promise<ToolPlanner> {
  const languageModel = getLanguageModel()

  if (!languageModel) {
    return {
      name: 'Chrome built-in AI',
      available: false,
      status: 'unavailable',
      detail: 'The browser does not expose the Chrome built-in AI LanguageModel API.',
      async plan(message: string, tools: WebMCPTool[]) {
        return planWithHeuristics(message, tools)
      }
    }
  }

  try {
    const availability = await languageModel.availability(chromeAITextOptions)
    if (availability === 'unavailable') {
      return createUnavailableChromePlanner('Chrome reports that built-in AI is unavailable in this environment.')
    }

    if (availability === 'downloadable' || availability === 'downloading') {
      return {
        name: 'Chrome built-in AI',
        available: false,
        status: availability,
        detail: availability === 'downloadable'
          ? 'Chrome built-in AI is available after the browser downloads the model.'
          : 'Chrome is downloading the built-in AI model.',
        async plan(message: string, tools: WebMCPTool[]) {
          return planWithHeuristics(message, tools)
        }
      }
    }

    let session: LanguageModelSession | undefined

    return {
      name: 'Chrome built-in AI',
      available: true,
      status: 'ready',
      detail: 'Chrome built-in AI is available. The model session will start from the next user command.',
      async plan(message: string, tools: WebMCPTool[]) {
        try {
          session ??= await createChromeAISession(languageModel)
          return await planWithChromeAI(session, message, tools)
        } catch (error) {
          return {
            ...planWithHeuristics(message, tools),
            reason: `Chrome built-in AI could not plan this command (${getErrorMessage(error)}). Used deterministic fallback.`
          }
        }
      }
    }
  } catch {
    return createUnavailableChromePlanner('Chrome built-in AI could not create a planning session.')
  }
}

export async function createBestPlanner(): Promise<ToolPlanner> {
  const chromePlanner = await createChromeAIPlanner()
  if (chromePlanner.available) return chromePlanner

  return createHeuristicPlanner()
}

async function planWithChromeAI(session: LanguageModelSession, message: string, tools: WebMCPTool[]): Promise<ToolPlan> {
  const schema = {
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

  const toolCatalog = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }))

  const response = await session.prompt(
    `User request: ${message}\n\nAvailable tools:\n${JSON.stringify(toolCatalog, null, 2)}`,
    { responseConstraint: schema }
  )

  return JSON.parse(response) as ToolPlan
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

function planWithHeuristics(message: string, tools: WebMCPTool[]): ToolPlan {
  const normalizedMessage = message.toLowerCase()

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
      toolName: pickToolName(tools, 'select_items_by_position'),
      input: {
        start: 1,
        count: extractQuantity(message)
      },
      confidence: 0.7,
      reason: 'Matched positional checklist selection wording.'
    }
  }

  if (normalizedMessage.includes('select') && normalizedMessage.includes('all')) {
    const category = extractSelectionCategory(normalizedMessage)

    if (category) {
      return {
        toolName: pickToolName(tools, 'select_items_by_category'),
        input: {
          category
        },
        confidence: 0.72,
        reason: 'Matched category checklist selection wording.'
      }
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

function extractSelectionCategory(normalizedMessage: string): string | undefined {
  if (/\bfruits?\b/.test(normalizedMessage)) return 'fruit'
  if (/\bvegetables?\b/.test(normalizedMessage)) return 'vegetable'
  if (/\bbakery\b|\bbread\b|\bbreads\b/.test(normalizedMessage)) return 'bakery'
  if (/\bdrinks?\b|\bbeverages?\b/.test(normalizedMessage)) return 'drink'
  return undefined
}

function extractCustomerName(message: string): string {
  const match = message.match(/(?:for|to)\s+([A-Z][\w\s-]{1,40})(?:\s+(?:for|with|at|of)\s+|$)/)
  return match?.[1]?.trim() ?? 'Acme Corp'
}

function getLanguageModel(): LanguageModelApi | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as WindowWithLanguageModel).LanguageModel
}

function createUnavailableChromePlanner(detail: string): ToolPlanner {
  return {
    name: 'Chrome built-in AI',
    available: false,
    status: 'unavailable',
    detail,
    async plan(message: string, tools: WebMCPTool[]) {
      return planWithHeuristics(message, tools)
    }
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'unknown error'
}
