export interface JsonSchema {
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  enum?: unknown[]
  const?: unknown
  title?: string
  minimum?: number
  maximum?: number
  minItems?: number
  maxItems?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: string
  description?: string
  additionalProperties?: boolean | JsonSchema
  [key: string]: unknown
}

export interface ToolScopeResult {
  available: boolean
  reason?: string
}

export interface ConfirmationTool {
  name: string
  description: string
  inputSchema: JsonSchema
  confirmation?: ToolConfirmation
}

export type ConfirmationHandler = (
  tool: ConfirmationTool,
  input: unknown,
  reason: string,
  context?: { signal: AbortSignal }
) => boolean | Promise<boolean>

export interface ToolConfirmation {
  required: boolean
  reason: string
  handler?: ConfirmationHandler
}

export interface ToolAnnotations {
  readOnlyHint?: boolean
  untrustedContentHint?: boolean
  [key: string]: unknown
}

export interface ToolContext {
  source: 'native' | 'fallback' | 'devtools' | 'resolver'
  signal?: AbortSignal
}

export interface WebMCPTool<TInput = Record<string, unknown>, TOutput = unknown> {
  name: string
  description: string
  inputSchema: JsonSchema
  outputSchema?: JsonSchema
  annotations?: ToolAnnotations
  confirmation?: ToolConfirmation
  examples?: TInput[]
  scope?: () => ToolScopeResult
  guard?: (input: TInput) => boolean | string | Promise<boolean | string>
  execute: (input: TInput, context: ToolContext) => Promise<TOutput> | TOutput
}

/**
 * A supertype of every WebMCPTool<TInput, TOutput>, usable for heterogeneous
 * tool lists without erasing per-tool input typing at the definition site.
 */
export interface AnyWebMCPTool {
  name: string
  description: string
  inputSchema: JsonSchema
  outputSchema?: JsonSchema
  annotations?: ToolAnnotations
  confirmation?: ToolConfirmation
  examples?: unknown[]
  scope?: () => ToolScopeResult
  guard?: (input: never) => boolean | string | Promise<boolean | string>
  execute: (input: never, context: ToolContext) => Promise<unknown> | unknown
}

export interface RegisteredTool<TInput = Record<string, unknown>, TOutput = unknown> {
  tool: WebMCPTool<TInput, TOutput>
  mode: 'native-and-fallback' | 'fallback'
  warnings: string[]
  ready: Promise<void>
  unregister: () => void
}

export interface RegistrySnapshot {
  supportLabel: string
  nativeWebMCP: boolean
  toolCount: number
  tools: RegisteredTool[]
}

export interface IntegrationDiagnostic {
  id: string
  severity: 'info' | 'warning' | 'error'
  title: string
  detail: string
  action: string
  toolName?: string
}

export interface IntegrationHealthReport {
  status: 'ready' | 'warning' | 'error'
  summary: string
  supportLabel: string
  nativeWebMCP: boolean
  toolCount: number
  diagnostics: IntegrationDiagnostic[]
}

export interface ToolInvocation<TInput = Record<string, unknown>> {
  id?: string
  toolName: string
  input: TInput
  confirmed?: boolean
  source?: ToolContext['source']
  signal?: AbortSignal
}

export type ToolInvocationErrorCode =
  | 'cancelled'
  | 'tool_changed'
  | 'confirmation_denied'
  | 'confirmation_failed'
  | 'execution_failed'
  | 'guard_blocked'
  | 'guard_failed'
  | 'invalid_input'
  | 'invalid_output'
  | 'not_registered'
  | 'scope_failed'
  | 'scope_unavailable'

export interface ToolInvocationResult<TOutput = unknown> {
  invocationId?: string
  toolName: string
  status: 'success' | 'error' | 'blocked' | 'unavailable'
  code?: ToolInvocationErrorCode
  output?: TOutput
  error?: string
  durationMs: number
}

export interface ToolResolution {
  toolName: string
  input: Record<string, unknown>
  confidence: number
  reason: string
  steps?: ToolResolutionStep[]
}

export interface ToolResolutionStep {
  toolName: string
  input: Record<string, unknown>
  confidence: number
  reason: string
}

export interface ResolverContext {
  [key: string]: unknown
}

export type ResolverProviderKind =
  | 'auto'
  | 'chrome-built-in'
  | 'local'
  | 'openai'
  | 'openrouter'
  | 'openai-compatible'
  | 'cloudflare-binding'

export type ResolverAuth =
  | { mode: 'none' }
  | { mode: 'server'; endpoint: string }
  | { mode: 'user-key'; apiKey?: string; storageKey?: string }

export interface ResolverProviderConfig {
  provider: ResolverProviderKind
  model?: string
  baseUrl?: string
  auth?: ResolverAuth
  responseFormat?: 'json_object' | 'json_schema'
  maxTokens?: number
  temperature?: number
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
}

export interface ResolverRequest {
  message: string
  tools: WebMCPTool[]
  context: ResolverContext
}

export interface ResolverRunOptions {
  signal?: AbortSignal
  singleStep?: boolean
  /** Maximum UTF-8 bytes in the serialized resolver request, including prompt/schema overhead. */
  maxRequestBytes?: number
}

export interface ToolResolver {
  capabilities?: { conversation: boolean }
  name: string
  available: boolean
  status: 'ready' | 'downloadable' | 'downloading' | 'unavailable' | 'fallback' | 'needs-key'
  detail: string
  resolve: (
    message: string,
    tools: WebMCPTool[],
    context?: ResolverContext,
    options?: ResolverRunOptions
  ) => Promise<ToolResolution>
  dispose?: () => void
}

export interface WebMCPKitEvent {
  type: 'registered' | 'unregistered' | 'invoked' | 'succeeded' | 'failed' | 'blocked'
  toolName: string
  timestamp: number
  detail?: unknown
}
