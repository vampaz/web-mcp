import { defineTool } from './define-tool'
import type { ToolContext, WebMCPTool } from './interfaces/tool'

export interface DefineServerToolOptions<
  TInput = Record<string, unknown>,
  TOutput = unknown
> extends Omit<WebMCPTool<TInput, TOutput>, 'execute'> {
  endpoint: string | URL
  fetch?: ServerToolFetch
  headers?: Record<string, string>
}

export type ServerToolFetch = (input: string | URL, init?: RequestInit) => Promise<Response>

export function defineServerTool<TInput = Record<string, unknown>, TOutput = unknown>(
  options: DefineServerToolOptions<TInput, TOutput>
): WebMCPTool<TInput, TOutput> {
  return defineTool<TInput, TOutput>({
    name: options.name,
    description: options.description,
    inputSchema: options.inputSchema,
    outputSchema: options.outputSchema,
    annotations: options.annotations,
    confirmation: options.confirmation,
    examples: options.examples,
    scope: options.scope,
    guard: options.guard,
    async execute(input, context) {
      return callServerTool(options, input, context)
    }
  })
}

async function callServerTool<TInput, TOutput>(
  options: DefineServerToolOptions<TInput, TOutput>,
  input: TInput,
  context: ToolContext
): Promise<TOutput> {
  const fetchTool = options.fetch ?? fetch
  const response = await fetchTool(options.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    body: JSON.stringify({
      toolName: options.name,
      input,
      source: context.source
    })
  })

  if (!response.ok) {
    throw new Error(await getServerToolError(options.name, response))
  }

  if (response.status === 204) return undefined as TOutput

  return (await response.json()) as TOutput
}

async function getServerToolError(toolName: string, response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown }
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return `${toolName} server endpoint returned ${response.status}: ${payload.error}`
    }
  } catch {
    return `${toolName} server endpoint returned ${response.status}`
  }

  return `${toolName} server endpoint returned ${response.status}`
}
