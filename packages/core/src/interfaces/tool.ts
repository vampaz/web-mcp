export interface JsonSchema {
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  anyOf?: JsonSchema[]
  enum?: unknown[]
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  description?: string
  additionalProperties?: boolean | JsonSchema
  [key: string]: unknown
}

export interface ToolScopeResult {
  available: boolean
  reason?: string
}

export interface ToolConfirmation {
  required: boolean
  reason: string
}

export interface ToolContext {
  source: 'native' | 'fallback' | 'devtools' | 'planner'
}

export interface WebMCPTool<TInput = Record<string, unknown>, TOutput = unknown> {
  name: string
  description: string
  inputSchema: JsonSchema
  outputSchema?: JsonSchema
  confirmation?: ToolConfirmation
  examples?: TInput[]
  scope?: () => ToolScopeResult
  guard?: (input: TInput) => boolean | string | Promise<boolean | string>
  execute: (input: TInput, context: ToolContext) => Promise<TOutput> | TOutput
}

export interface RegisteredTool<TInput = Record<string, unknown>, TOutput = unknown> {
  tool: WebMCPTool<TInput, TOutput>
  mode: 'native-and-fallback' | 'fallback'
  warnings: string[]
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
}

export interface ToolInvocationResult<TOutput = unknown> {
  invocationId?: string
  toolName: string
  status: 'success' | 'error' | 'blocked' | 'unavailable'
  output?: TOutput
  error?: string
  durationMs: number
}

export interface ToolPlan {
  toolName: string
  input: Record<string, unknown>
  confidence: number
  reason: string
}

export interface PlannerContext {
  [key: string]: unknown
}

export type PlannerProviderKind =
  | 'auto'
  | 'chrome-built-in'
  | 'local'
  | 'openai'
  | 'openrouter'
  | 'openai-compatible'
  | 'cloudflare-binding'
  | 'cloudflare-workers-ai'

export type PlannerAuth =
  | { mode: 'none' }
  | { mode: 'server', endpoint: string }
  | { mode: 'user-key', apiKey?: string, storageKey?: string, allowInProduction?: boolean }

export interface PlannerProviderConfig {
  provider: PlannerProviderKind
  model?: string
  baseUrl?: string
  accountId?: string
  auth?: PlannerAuth
}

export interface PlannerRequest {
  message: string
  tools: WebMCPTool[]
  context: PlannerContext
}

export interface ToolPlanner {
  name: string
  available: boolean
  status: 'ready' | 'downloadable' | 'downloading' | 'unavailable' | 'fallback' | 'needs-key'
  detail: string
  plan: (message: string, tools: WebMCPTool[], context?: PlannerContext) => Promise<ToolPlan>
  dispose?: () => void
}

export interface WebMCPKitEvent {
  type: 'registered' | 'unregistered' | 'invoked' | 'succeeded' | 'failed' | 'blocked'
  toolName: string
  timestamp: number
  detail?: unknown
}
