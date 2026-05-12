export interface JsonSchema {
  type?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
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

export interface ToolInvocation<TInput = Record<string, unknown>> {
  toolName: string
  input: TInput
  confirmed?: boolean
  source?: ToolContext['source']
}

export interface ToolInvocationResult<TOutput = unknown> {
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

export interface ToolPlanner {
  name: string
  available: boolean
  status: 'ready' | 'downloadable' | 'downloading' | 'unavailable' | 'fallback'
  detail: string
  plan: (message: string, tools: WebMCPTool[]) => Promise<ToolPlan>
}

export interface WebMCPKitEvent {
  type: 'registered' | 'unregistered' | 'invoked' | 'succeeded' | 'failed' | 'blocked'
  toolName: string
  timestamp: number
  detail?: unknown
}
