import type { ToolPlan, ToolPlanner, WebMCPTool } from './interfaces/tool'

interface LanguageModelSession {
  prompt: (message: string, options?: { responseConstraint?: unknown }) => Promise<string>
}

interface LanguageModelApi {
  availability: (options?: unknown) => Promise<ChromeAIAvailability>
  create: (options?: unknown) => Promise<LanguageModelSession>
}

interface WindowWithLanguageModel extends Window {
  LanguageModel?: LanguageModelApi
}

type ChromeAIAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable'

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
    const availability = await languageModel.availability()
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

    const session = await languageModel.create({
      initialPrompts: [
        {
          role: 'system',
          content: 'Choose exactly one app tool for the user request. Return only JSON matching the requested schema.'
        }
      ]
    })

    return {
      name: 'Chrome built-in AI',
      available: true,
      status: 'ready',
      detail: 'Chrome built-in AI is ready and will choose tools locally in the browser.',
      async plan(message: string, tools: WebMCPTool[]) {
        return planWithChromeAI(session, message, tools)
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

  if (normalizedMessage.includes('cart') || normalizedMessage.includes('add ')) {
    return {
      toolName: pickToolName(tools, 'add_to_cart'),
      input: {
        productId: normalizedMessage.includes('keyboard') ? 'kbd-01' : 'dock-02',
        quantity: 1
      },
      confidence: 0.68,
      reason: 'Matched add-to-cart wording.'
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
