import type {
  JsonSchema,
  ResolverContext,
  ResolverProviderKind,
  ToolAnnotations,
  ToolResolution
} from '@vampaz/webmcp-kit'

/** Providers that the server handler can forward to an OpenAI-compatible endpoint. */
export type ServerResolverProvider = 'openai' | 'openrouter' | 'openai-compatible'

/** Tool fields in the existing browser-to-server resolver wire format. */
export interface ResolverEndpointTool {
  name: string
  description: string
  inputSchema: JsonSchema
  outputSchema?: JsonSchema
  annotations?: ToolAnnotations
}

/** Request body sent by `createResolver({ auth: { mode: 'server' } })`. */
export interface ResolverEndpointRequest {
  provider: ResolverProviderKind
  model: string
  message: string
  tools: ResolverEndpointTool[]
  context: ResolverContext
  /**
   * Wire metadata from the browser. The handler validates its shape but rebuilds the upstream
   * response schema from the tools, `singleStep`, and `purpose`; it never applies client constraints.
   */
  responseSchema: JsonSchema
  singleStep?: true
  purpose?: 'summary'
}

export type ResolverAuthorize = (
  request: Request,
  payload: ResolverEndpointRequest
) => boolean | Promise<boolean>

export interface ResolverHandlerOptions {
  provider: ServerResolverProvider
  /** Application-owned upstream base URL. The handler appends `/chat/completions`. */
  baseUrl: string
  /** Server-side provider key. It is never returned or logged by the handler. */
  apiKey: string
  allowedModels: readonly string[]
  /** Defaults to 1 MiB. Enforced by reading the stream, not `Content-Length`. */
  maxBodyBytes?: number
  /** Required. Only a literal `true` result allows the request. */
  authorize: ResolverAuthorize
  responseFormat?: 'json_object' | 'json_schema' | 'text'
  maxTokens?: number
  temperature?: number
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
}

/** Web-standard resolver endpoint handler. */
export type ResolverHandler = (request: Request) => Promise<Response>

export interface ResolverResponseError {
  error: string
}

export type ResolverHandlerResult = ToolResolution | ResolverResponseError
