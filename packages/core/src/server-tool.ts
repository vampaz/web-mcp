import { defineTool, type SchemaTypedWebMCPTool } from './define-tool'
import type { InferToolInput } from './interfaces/schema-inference'
import type { JsonSchema, ToolContext, WebMCPTool } from './interfaces/tool'

export interface ServerToolEndpointOptions {
  endpoint: string | URL
  fetch?: ServerToolFetch
  headers?: Record<string, string>
}

export interface DefineServerToolOptions<TInput = Record<string, unknown>, TOutput = unknown>
  extends Omit<WebMCPTool<TInput, TOutput>, 'execute'>, ServerToolEndpointOptions {}

export type SchemaTypedServerToolOptions<TSchema extends JsonSchema, TOutput = unknown> = Omit<
  SchemaTypedWebMCPTool<TSchema, TOutput>,
  'execute'
> &
  ServerToolEndpointOptions

export type ServerToolFetch = (input: string | URL, init?: RequestInit) => Promise<Response>

export function defineServerTool<const TSchema extends JsonSchema, TOutput = unknown>(
  options: SchemaTypedServerToolOptions<TSchema, TOutput>
): WebMCPTool<InferToolInput<TSchema>, TOutput>
export function defineServerTool<TInput = Record<string, unknown>, TOutput = unknown>(
  options: DefineServerToolOptions<TInput, TOutput>
): WebMCPTool<TInput, TOutput>
export function defineServerTool(
  options: DefineServerToolOptions<unknown, unknown>
): WebMCPTool<unknown, unknown> {
  // Forward every tool field (parseInput, scope, guard, …); only execution moves to the server.
  const { endpoint: _endpoint, fetch: _fetch, headers: _headers, ...tool } = options
  return defineTool<unknown, unknown>({
    ...tool,
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
    }),
    ...(context.signal ? { signal: context.signal } : {})
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
