# Complete API reference

Generated from every entry in `package.json#exports`. Run `npm run docs:api` after API changes; `npm run docs:api:check` rejects a stale reference. This process reads TypeScript and does not build the library.

Start with the [integration guide](./integration.md) for a working application, the [architecture](./architecture.md) for ownership and lifecycle, and [API behavior](./api-behavior.md) for defaults, errors, and usage. Signatures below are the complete public exports, including overloads and type fields. Referenced framework and Zod types come from their optional peers. Supporting types at the end describe signatures but are not package-root imports.

- [`@vampaz/webmcp-kit`](#vampazwebmcp-kit)

- [`@vampaz/webmcp-kit/devtools`](#vampazwebmcp-kitdevtools)

- [`@vampaz/webmcp-kit/mcp-bridge`](#vampazwebmcp-kitmcp-bridge)

- [`@vampaz/webmcp-kit/react`](#vampazwebmcp-kitreact)

- [`@vampaz/webmcp-kit/svelte`](#vampazwebmcp-kitsvelte)

- [`@vampaz/webmcp-kit/testing`](#vampazwebmcp-kittesting)

- [`@vampaz/webmcp-kit/testing/playwright`](#vampazwebmcp-kittestingplaywright)

- [`@vampaz/webmcp-kit/vue`](#vampazwebmcp-kitvue)

- [`@vampaz/webmcp-kit/zod`](#vampazwebmcp-kitzod)

- [`@vampaz/webmcp-kit/pi`](#vampazwebmcp-kitpi)

- [`@vampaz/webmcp-kit/pi/worker`](#vampazwebmcp-kitpiworker)

- [`@vampaz/webmcp-kit/chat`](#vampazwebmcp-kitchat)

## @vampaz/webmcp-kit

### AnyWebMCPTool

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

A supertype of every WebMCPTool<TInput, TOutput>, usable for heterogeneous
tool lists without erasing per-tool input typing at the definition site.

```ts
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
```

### ArrayParamOptions

Source in the repository: `packages/core/src/schema-builders.ts`. [Packaged declaration](../dist/packages/core/src/schema-builders.d.ts).

```ts
export interface ArrayParamOptions {
  description?: string
  maxItems?: number
  minItems?: number
}
```

### ConfirmationHandler

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
export type ConfirmationHandler = (
  tool: ConfirmationTool,
  input: unknown,
  reason: string,
  context?: { signal: AbortSignal }
) => boolean | Promise<boolean>
```

### ConfirmationTool

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
export interface ConfirmationTool {
  name: string
  description: string
  inputSchema: JsonSchema
  confirmation?: ToolConfirmation
}
```

### DefineServerToolOptions

Source in the repository: `packages/core/src/server-tool.ts`. [Packaged declaration](../dist/packages/core/src/server-tool.d.ts).

```ts
export interface DefineServerToolOptions<
  TInput = Record<string, unknown>,
  TOutput = unknown
> extends Omit<WebMCPTool<TInput, TOutput>, 'execute'> {
  endpoint: string | URL
  fetch?: ServerToolFetch
  headers?: Record<string, string>
}
```

### FormInput

Source in the repository: `packages/core/src/forms.ts`. [Packaged declaration](../dist/packages/core/src/forms.d.ts).

```ts
export type FormInput = Record<string, string | number | boolean | string[]>
```

### HostedOpenAIPlannerOptionConfig

Source in the repository: `packages/core/src/hosted-openai-planner.ts`. [Packaged declaration](../dist/packages/core/src/hosted-openai-planner.d.ts).

```ts
export interface HostedOpenAIPlannerOptionConfig {
  accessKey?: string
  baseUrl?: string
  browserChallengeSiteKey?: string
  endpoint?: string
  id?: string
  label?: string
  model?: string
  modelOptions?: WebMCPCommandInputPlannerModelOption[]
  sessionEndpoint?: string
}
```

### HostedOpenAIPlannerOptions

Source in the repository: `packages/core/src/hosted-openai-planner.ts`. [Packaged declaration](../dist/packages/core/src/hosted-openai-planner.d.ts).

```ts
export interface HostedOpenAIPlannerOptions {
  accessKey?: string
  baseUrl?: string
  browserChallengeSiteKey?: string
  endpoint?: string
  model: string
  sessionEndpoint?: string
}
```

### InferToolInput

Source in the repository: `packages/core/src/interfaces/schema-inference.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/schema-inference.d.ts).

Derives the TypeScript input type from a JSON Schema literal, covering the
schema subset validated by validateJsonSchema(): object/properties/required,
string, number, integer, boolean, null, array/items, anyOf, oneOf, const,
and enum.

Wide schemas (values not written as literals in source) fall back to
Record<string, unknown>, matching the historical defineTool() default.

```ts
export type InferToolInput<TSchema extends JsonSchema> = UnknownToRecord<
  InferJsonSchemaType<TSchema>
>
```

### InitWebMCPOptions

Source in the repository: `packages/core/src/init.ts`. [Packaged declaration](../dist/packages/core/src/init.d.ts).

```ts
export interface InitWebMCPOptions {
  accessKey?: string
  baseUrl?: string
  browserChallengeSiteKey?: string
  buttonLabel?: string
  confirmationHandler?: ConfirmationHandler
  context?: PlannerContext | (() => PlannerContext)
  model?: string
  placeholder?: string
  planner?: ToolPlanner
  target?: string | WebMCPCommandInputElement
  tools?: readonly AnyWebMCPTool[]
}
```

### IntegrationDiagnostic

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
export interface IntegrationDiagnostic {
  id: string
  severity: 'info' | 'warning' | 'error'
  title: string
  detail: string
  action: string
  toolName?: string
}
```

### IntegrationHealthOptions

Source in the repository: `packages/core/src/diagnostics.ts`. [Packaged declaration](../dist/packages/core/src/diagnostics.d.ts).

```ts
export interface IntegrationHealthOptions {
  planner?: ToolPlanner
}
```

### IntegrationHealthReport

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
export interface IntegrationHealthReport {
  status: 'ready' | 'warning' | 'error'
  summary: string
  supportLabel: string
  nativeWebMCP: boolean
  toolCount: number
  diagnostics: IntegrationDiagnostic[]
}
```

### JsonSchema

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
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
```

### NumberParamOptions

Source in the repository: `packages/core/src/schema-builders.ts`. [Packaged declaration](../dist/packages/core/src/schema-builders.d.ts).

```ts
export interface NumberParamOptions {
  description?: string
  maximum?: number
  minimum?: number
}
```

### ObjectInputSchemaOptions

Source in the repository: `packages/core/src/schema-builders.ts`. [Packaged declaration](../dist/packages/core/src/schema-builders.d.ts).

```ts
export interface ObjectInputSchemaOptions {
  additionalProperties?: boolean | JsonSchema
  required?: string[]
}
```

### OpenAIFunctionTool

Source in the repository: `packages/core/src/adapters/openai.ts`. [Packaged declaration](../dist/packages/core/src/adapters/openai.d.ts).

```ts
export interface OpenAIFunctionTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: JsonSchema
  }
}
```

### PlannerAuth

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
export type PlannerAuth =
  | { mode: 'none' }
  | { mode: 'server'; endpoint: string }
  | { mode: 'user-key'; apiKey?: string; storageKey?: string; allowInProduction?: boolean }
```

### PlannerContext

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
export interface PlannerContext {
  [key: string]: unknown
}
```

### PlannerOutcomeToolName

Source in the repository: `packages/core/src/plan-validation.ts`. [Packaged declaration](../dist/packages/core/src/plan-validation.d.ts).

```ts
export type PlannerOutcomeToolName = (typeof plannerOutcomeToolNames)[number]
```

### PlannerProviderConfig

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
export interface PlannerProviderConfig {
  provider: PlannerProviderKind
  model?: string
  baseUrl?: string
  auth?: PlannerAuth
  responseFormat?: 'json_object' | 'json_schema'
  maxTokens?: number
  temperature?: number
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
}
```

### PlannerProviderKind

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
export type PlannerProviderKind =
  | 'auto'
  | 'chrome-built-in'
  | 'local'
  | 'openai'
  | 'openrouter'
  | 'openai-compatible'
  | 'cloudflare-binding'
```

### PlannerRequest

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
export interface PlannerRequest {
  message: string
  tools: WebMCPTool[]
  context: PlannerContext
}
```

### RegisterFormToolFieldOptions

Source in the repository: `packages/core/src/forms.ts`. [Packaged declaration](../dist/packages/core/src/forms.d.ts).

```ts
export interface RegisterFormToolFieldOptions {
  title?: string
  description?: string
}
```

### RegisterFormToolOptions

Source in the repository: `packages/core/src/forms.ts`. [Packaged declaration](../dist/packages/core/src/forms.d.ts).

```ts
export interface RegisterFormToolOptions<TOutput = FormData> {
  form: HTMLFormElement
  name: string
  description: string
  confirmation?: WebMCPTool<FormInput, TOutput>['confirmation']
  fields?: Record<string, RegisterFormToolFieldOptions>
  execute?: (input: FormInput, form: HTMLFormElement) => Promise<TOutput> | TOutput
}
```

### RegisteredTool

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
export interface RegisteredTool<TInput = Record<string, unknown>, TOutput = unknown> {
  tool: WebMCPTool<TInput, TOutput>
  mode: 'native-and-fallback' | 'fallback'
  warnings: string[]
  ready: Promise<void>
  unregister: () => void
}
```

### RegistrySnapshot

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
export interface RegistrySnapshot {
  supportLabel: string
  nativeWebMCP: boolean
  toolCount: number
  tools: RegisteredTool[]
}
```

### SchemaTypedWebMCPTool

Source in the repository: `packages/core/src/define-tool.ts`. [Packaged declaration](../dist/packages/core/src/define-tool.d.ts).

```ts
export type SchemaTypedWebMCPTool<TSchema extends JsonSchema, TOutput = unknown> = Omit<
  WebMCPTool<InferToolInput<TSchema>, TOutput>,
  'inputSchema'
> & { inputSchema: TSchema }
```

### ServerToolFetch

Source in the repository: `packages/core/src/server-tool.ts`. [Packaged declaration](../dist/packages/core/src/server-tool.d.ts).

```ts
export type ServerToolFetch = (input: string | URL, init?: RequestInit) => Promise<Response>
```

### StringParamOptions

Source in the repository: `packages/core/src/schema-builders.ts`. [Packaged declaration](../dist/packages/core/src/schema-builders.d.ts).

```ts
export interface StringParamOptions {
  description?: string
  maxLength?: number
  minLength?: number
  pattern?: string
}
```

### TestBridgeSnapshot

Source in the repository: `packages/core/src/test-bridge.ts`. [Packaged declaration](../dist/packages/core/src/test-bridge.d.ts).

```ts
export interface TestBridgeSnapshot extends Omit<RegistrySnapshot, 'tools'> {
  tools: TestBridgeTool[]
}
```

### TestBridgeTool

Source in the repository: `packages/core/src/test-bridge.ts`. [Packaged declaration](../dist/packages/core/src/test-bridge.d.ts).

```ts
export interface TestBridgeTool {
  name: string
  description: string
  inputSchema: RegisteredTool['tool']['inputSchema']
  outputSchema?: RegisteredTool['tool']['outputSchema']
  confirmation?: RegisteredTool['tool']['confirmation']
  mode: RegisteredTool['mode']
  warnings: string[]
  available: boolean
  unavailableReason?: string
}
```

### ToolAnnotations

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
export interface ToolAnnotations {
  readOnlyHint?: boolean
  untrustedContentHint?: boolean
  [key: string]: unknown
}
```

### ToolCatalog

Source in the repository: `packages/core/src/adapters/catalog.ts`. [Packaged declaration](../dist/packages/core/src/adapters/catalog.d.ts).

```ts
export interface ToolCatalog {
  title: string
  tools: ToolCatalogEntry[]
}
```

### ToolCatalogEntry

Source in the repository: `packages/core/src/adapters/catalog.ts`. [Packaged declaration](../dist/packages/core/src/adapters/catalog.d.ts).

```ts
export interface ToolCatalogEntry {
  name: string
  description: string
  mode: RegisteredTool['mode']
  inputSchema: JsonSchema
  outputSchema?: JsonSchema
  confirmation?: ToolConfirmation
  examples: unknown[]
  warnings: string[]
  available: boolean
  unavailableReason?: string
}
```

### ToolCatalogOptions

Source in the repository: `packages/core/src/adapters/catalog.ts`. [Packaged declaration](../dist/packages/core/src/adapters/catalog.d.ts).

```ts
export interface ToolCatalogOptions {
  title?: string
}
```

### ToolConfirmation

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
export interface ToolConfirmation {
  required: boolean
  reason: string
  handler?: ConfirmationHandler
}
```

### ToolContext

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
export interface ToolContext {
  source: 'native' | 'fallback' | 'devtools' | 'planner'
  signal?: AbortSignal
}
```

### ToolInvocation

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
export interface ToolInvocation<TInput = Record<string, unknown>> {
  id?: string
  toolName: string
  input: TInput
  confirmed?: boolean
  source?: ToolContext['source']
  signal?: AbortSignal
}
```

### ToolInvocationErrorCode

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
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
```

### ToolInvocationResult

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
export interface ToolInvocationResult<TOutput = unknown> {
  invocationId?: string
  toolName: string
  status: 'success' | 'error' | 'blocked' | 'unavailable'
  code?: ToolInvocationErrorCode
  output?: TOutput
  error?: string
  durationMs: number
}
```

### ToolPlan

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
export interface ToolPlan {
  toolName: string
  input: Record<string, unknown>
  confidence: number
  reason: string
  steps?: ToolPlanStep[]
}
```

### ToolPlanStep

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
export interface ToolPlanStep {
  toolName: string
  input: Record<string, unknown>
  confidence: number
  reason: string
}
```

### ToolPlanValidationOptions

Source in the repository: `packages/core/src/plan-validation.ts`. [Packaged declaration](../dist/packages/core/src/plan-validation.d.ts).

```ts
export interface ToolPlanValidationOptions {
  messageStyle?: 'provider' | 'server'
  singleStep?: boolean
}
```

### ToolPlanValidationTool

Source in the repository: `packages/core/src/plan-validation.ts`. [Packaged declaration](../dist/packages/core/src/plan-validation.d.ts).

```ts
export interface ToolPlanValidationTool {
  name?: string
  inputSchema?: JsonSchema
}
```

### ToolPlanner

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
export interface ToolPlanner {
  capabilities?: { conversation: boolean }
  name: string
  available: boolean
  status: 'ready' | 'downloadable' | 'downloading' | 'unavailable' | 'fallback' | 'needs-key'
  detail: string
  plan: (
    message: string,
    tools: WebMCPTool[],
    context?: PlannerContext,
    options?: PlannerRunOptions
  ) => Promise<ToolPlan>
  dispose?: () => void
}
```

### ToolScopeResult

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
export interface ToolScopeResult {
  available: boolean
  reason?: string
}
```

### WebMCPCommandErrorEventDetail

Source in the repository: `packages/core/src/interfaces/command-input.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/command-input.d.ts).

```ts
export interface WebMCPCommandErrorEventDetail {
  error: string
  message: string
}
```

### WebMCPCommandInputConfigureOptions

Source in the repository: `packages/core/src/interfaces/command-input.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/command-input.d.ts).

```ts
export interface WebMCPCommandInputConfigureOptions {
  apiKey?: string
  authMode?: 'none' | 'server' | 'user-key'
  baseUrl?: string
  buttonLabel?: string
  context?: PlannerContext | (() => PlannerContext)
  disabled?: boolean
  endpoint?: string
  endpointOptions?: WebMCPCommandInputEndpointOption[]
  floating?: boolean
  initialModel?: string
  initialPlannerOptionId?: string
  initialProvider?: PlannerProviderKind
  model?: string
  placeholder?: string
  planner?: ToolPlanner
  plannerConfig?: PlannerProviderConfig
  plannerOptions?: WebMCPCommandInputPlannerOption[]
  provider?: PlannerProviderKind
  settingsOpen?: boolean
  showChromeAI?: boolean
}
```

### WebMCPCommandInputElement

Source in the repository: `packages/core/src/interfaces/command-input.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/command-input.d.ts).

```ts
export interface WebMCPCommandInputElement extends HTMLElement {
  apiKey?: string
  authMode?: 'none' | 'server' | 'user-key'
  baseUrl?: string
  buttonLabel?: string
  context?: PlannerContext | (() => PlannerContext)
  disabled: boolean
  endpoint?: string
  endpointOptions?: WebMCPCommandInputEndpointOption[]
  floating: boolean
  model?: string
  panelOpen: boolean
  placeholder: string
  planner?: ToolPlanner
  plannerConfig?: PlannerProviderConfig
  plannerOptions?: WebMCPCommandInputPlannerOption[]
  provider?: PlannerProviderKind
  showChromeAI?: boolean
  closePanel: () => void
  configure: (options: WebMCPCommandInputConfigureOptions) => void
  openPanel: () => void
  run: (
    message?: string,
    options?: WebMCPCommandInputRunOptions
  ) => Promise<ToolInvocationResult | undefined>
  togglePanel: () => void
}
```

### WebMCPCommandInputEndpointOption

Source in the repository: `packages/core/src/interfaces/command-input.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/command-input.d.ts).

```ts
export interface WebMCPCommandInputEndpointOption {
  label: string
  model?: string
  provider: PlannerProviderKind
}
```

### WebMCPCommandInputPhase

Source in the repository: `packages/core/src/interfaces/command-input.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/command-input.d.ts).

```ts
export type WebMCPCommandInputPhase =
  | 'idle'
  | 'preparing'
  | 'planning'
  | 'executing'
  | 'completed'
  | 'failed'
```

### WebMCPCommandInputPlannerCreateOptions

Source in the repository: `packages/core/src/interfaces/command-input.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/command-input.d.ts).

```ts
export interface WebMCPCommandInputPlannerCreateOptions {
  model?: string
  modelOption?: WebMCPCommandInputPlannerModelOption
}
```

### WebMCPCommandInputPlannerModelOption

Source in the repository: `packages/core/src/interfaces/command-input.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/command-input.d.ts).

```ts
export interface WebMCPCommandInputPlannerModelOption {
  label: string
  model: string
}
```

### WebMCPCommandInputPlannerOption

Source in the repository: `packages/core/src/interfaces/command-input.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/command-input.d.ts).

```ts
export interface WebMCPCommandInputPlannerOption {
  createPlanner: (
    options?: WebMCPCommandInputPlannerCreateOptions
  ) => Promise<ToolPlanner> | ToolPlanner
  id: string
  label: string
  modelOptions?: WebMCPCommandInputPlannerModelOption[]
}
```

### WebMCPCommandPanelToggleEventDetail

Source in the repository: `packages/core/src/interfaces/command-input.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/command-input.d.ts).

```ts
export interface WebMCPCommandPanelToggleEventDetail {
  open: boolean
}
```

### WebMCPCommandPlanEventDetail

Source in the repository: `packages/core/src/interfaces/command-input.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/command-input.d.ts).

```ts
export interface WebMCPCommandPlanEventDetail {
  message: string
  plan: ToolPlan
  planner: ToolPlanner
}
```

### WebMCPCommandPlannerEventDetail

Source in the repository: `packages/core/src/interfaces/command-input.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/command-input.d.ts).

```ts
export interface WebMCPCommandPlannerEventDetail {
  planner: ToolPlanner
}
```

### WebMCPCommandResultEventDetail

Source in the repository: `packages/core/src/interfaces/command-input.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/command-input.d.ts).

```ts
export interface WebMCPCommandResultEventDetail {
  message: string
  plan: ToolPlan
  result: ToolInvocationResult
}
```

### WebMCPCommandStepEventDetail

Source in the repository: `packages/core/src/interfaces/command-input.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/command-input.d.ts).

```ts
export interface WebMCPCommandStepEventDetail {
  message: string
  phase: 'started' | 'completed'
  plan: ToolPlan
  result?: ToolInvocationResult
  step: ToolPlanStep
  stepCount: number
  stepIndex: number
}
```

### WebMCPInitHandle

Source in the repository: `packages/core/src/init.ts`. [Packaged declaration](../dist/packages/core/src/init.d.ts).

```ts
export interface WebMCPInitHandle {
  element: WebMCPCommandInputElement
  planner?: ToolPlanner
  registrations: RegisteredTool[]
  destroy: () => void
}
```

### WebMCPKit

Source in the repository: `packages/core/src/kit.ts`. [Packaged declaration](../dist/packages/core/src/kit.d.ts).

```ts
export interface WebMCPKit {
  planner: ToolPlanner
  plannerConfig?: PlannerProviderConfig
}
```

### WebMCPKitEvent

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
export interface WebMCPKitEvent {
  type: 'registered' | 'unregistered' | 'invoked' | 'succeeded' | 'failed' | 'blocked'
  toolName: string
  timestamp: number
  detail?: unknown
}
```

### WebMCPKitOptions

Source in the repository: `packages/core/src/kit.ts`. [Packaged declaration](../dist/packages/core/src/kit.d.ts).

```ts
export interface WebMCPKitOptions {
  planner?: PlannerProviderConfig
}
```

### WebMCPKitTestBridge

Source in the repository: `packages/core/src/test-bridge.ts`. [Packaged declaration](../dist/packages/core/src/test-bridge.d.ts).

```ts
export interface WebMCPKitTestBridge {
  getRegistrySnapshot: () => TestBridgeSnapshot
  listTools: () => TestBridgeTool[]
  invokeTool: <TOutput = unknown>(
    invocation: ToolInvocation
  ) => Promise<ToolInvocationResult<TOutput>>
}
```

### WebMCPTool

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
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
```

### arrayParam

Source in the repository: `packages/core/src/schema-builders.ts`. [Packaged declaration](../dist/packages/core/src/schema-builders.d.ts).

```ts
declare function arrayParam(items: JsonSchema, options?: ArrayParamOptions): JsonSchema
```

### assertWebMCPIntegration

Source in the repository: `packages/core/src/diagnostics.ts`. [Packaged declaration](../dist/packages/core/src/diagnostics.d.ts).

```ts
declare function assertWebMCPIntegration(
  options?: IntegrationHealthOptions
): IntegrationHealthReport
```

### booleanParam

Source in the repository: `packages/core/src/schema-builders.ts`. [Packaged declaration](../dist/packages/core/src/schema-builders.d.ts).

```ts
declare function booleanParam(description?: string): JsonSchema
```

### clearToolsForTest

Source in the repository: `packages/core/src/registry.ts`. [Packaged declaration](../dist/packages/core/src/registry.d.ts).

```ts
declare function clearToolsForTest(): void
```

### createBestPlanner

Source in the repository: `packages/core/src/planner.ts`. [Packaged declaration](../dist/packages/core/src/planner.d.ts).

```ts
declare function createBestPlanner(): Promise<ToolPlanner>
```

### createChromeAIPlanner

Source in the repository: `packages/core/src/planner.ts`. [Packaged declaration](../dist/packages/core/src/planner.d.ts).

```ts
declare function createChromeAIPlanner(strict?: boolean): Promise<ToolPlanner>
```

### createConfiguredPlanner

Source in the repository: `packages/core/src/planner.ts`. [Packaged declaration](../dist/packages/core/src/planner.d.ts).

```ts
declare function createConfiguredPlanner(config?: PlannerProviderConfig): Promise<ToolPlanner>
```

### createHeuristicPlanner

Source in the repository: `packages/core/src/planner.ts`. [Packaged declaration](../dist/packages/core/src/planner.d.ts).

```ts
declare function createHeuristicPlanner(): ToolPlanner
```

### createHostedOpenAIPlanner

Source in the repository: `packages/core/src/hosted-openai-planner.ts`. [Packaged declaration](../dist/packages/core/src/hosted-openai-planner.d.ts).

```ts
declare function createHostedOpenAIPlanner(rawOptions: HostedOpenAIPlannerOptions): ToolPlanner
```

### createHostedOpenAIPlannerOption

Source in the repository: `packages/core/src/hosted-openai-planner.ts`. [Packaged declaration](../dist/packages/core/src/hosted-openai-planner.d.ts).

```ts
declare function createHostedOpenAIPlannerOption(
  config: HostedOpenAIPlannerOptionConfig
): WebMCPCommandInputPlannerOption
```

### createRemotePlanner

Source in the repository: `packages/core/src/planner.ts`. [Packaged declaration](../dist/packages/core/src/planner.d.ts).

```ts
declare function createRemotePlanner(config: PlannerProviderConfig): ToolPlanner
```

### createToolCatalog

Source in the repository: `packages/core/src/adapters/catalog.ts`. [Packaged declaration](../dist/packages/core/src/adapters/catalog.d.ts).

```ts
declare function createToolCatalog(
  registrations: CatalogRegistration[],
  options?: ToolCatalogOptions
): ToolCatalog
```

### createWebMCPKit

Source in the repository: `packages/core/src/kit.ts`. [Packaged declaration](../dist/packages/core/src/kit.d.ts).

```ts
declare function createWebMCPKit(options?: WebMCPKitOptions): Promise<WebMCPKit>
```

### defineServerTool

Source in the repository: `packages/core/src/server-tool.ts`. [Packaged declaration](../dist/packages/core/src/server-tool.d.ts).

```ts
declare function defineServerTool<TInput = Record<string, unknown>, TOutput = unknown>(
  options: DefineServerToolOptions<TInput, TOutput>
): WebMCPTool<TInput, TOutput>
```

### defineTool

Source in the repository: `packages/core/src/define-tool.ts`. [Packaged declaration](../dist/packages/core/src/define-tool.d.ts).

```ts
declare function defineTool<const TSchema extends JsonSchema, TOutput = unknown>(
  tool: SchemaTypedWebMCPTool<TSchema, TOutput>
): WebMCPTool<InferToolInput<TSchema>, TOutput>
declare function defineTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>
): WebMCPTool<TInput, TOutput>
```

### defineWebMCPCommandInput

Source in the repository: `packages/core/src/command-input.ts`. [Packaged declaration](../dist/packages/core/src/command-input.d.ts).

```ts
declare function defineWebMCPCommandInput(tagName?: string): CommandInputConstructor
```

### emitWebMCPKitEvent

Source in the repository: `packages/core/src/events.ts`. [Packaged declaration](../dist/packages/core/src/events.d.ts).

```ts
declare function emitWebMCPKitEvent(event: WebMCPKitEvent): void
```

### enumParam

Source in the repository: `packages/core/src/schema-builders.ts`. [Packaged declaration](../dist/packages/core/src/schema-builders.d.ts).

```ts
declare function enumParam<TValue extends string | number | boolean>(
  values: readonly TValue[],
  description?: string
): JsonSchema
```

### escapeAttribute

Source in the repository: `packages/core/src/command-input-html.ts`. [Packaged declaration](../dist/packages/core/src/command-input-html.d.ts).

```ts
declare function escapeAttribute(value: string): string
```

### escapeHtml

Source in the repository: `packages/core/src/command-input-html.ts`. [Packaged declaration](../dist/packages/core/src/command-input-html.d.ts).

```ts
declare function escapeHtml(value: string): string
```

### formatJsonValueValidationError

Source in the repository: `packages/core/src/schema.ts`. [Packaged declaration](../dist/packages/core/src/schema.d.ts).

```ts
declare function formatJsonValueValidationError(
  errors: string[],
  subject?: 'input' | 'output'
): string
```

### formatOpenAITool

Source in the repository: `packages/core/src/adapters/openai.ts`. [Packaged declaration](../dist/packages/core/src/adapters/openai.d.ts).

```ts
declare function formatOpenAITool(tool: AnyWebMCPTool): OpenAIFunctionTool
```

### formatOpenAITools

Source in the repository: `packages/core/src/adapters/openai.ts`. [Packaged declaration](../dist/packages/core/src/adapters/openai.d.ts).

```ts
declare function formatOpenAITools(tools: readonly AnyWebMCPTool[]): OpenAIFunctionTool[]
```

### formatToolCatalogMarkdown

Source in the repository: `packages/core/src/adapters/catalog.ts`. [Packaged declaration](../dist/packages/core/src/adapters/catalog.d.ts).

```ts
declare function formatToolCatalogMarkdown(catalog: ToolCatalog): string
```

### getErrorMessage

Source in the repository: `packages/core/src/confirmation.ts`. [Packaged declaration](../dist/packages/core/src/confirmation.d.ts).

```ts
declare function getErrorMessage(error: unknown): string
```

### getIntegrationHealthReport

Source in the repository: `packages/core/src/diagnostics.ts`. [Packaged declaration](../dist/packages/core/src/diagnostics.d.ts).

```ts
declare function getIntegrationHealthReport(
  options?: IntegrationHealthOptions
): IntegrationHealthReport
```

### getRegistrySnapshot

Source in the repository: `packages/core/src/registry.ts`. [Packaged declaration](../dist/packages/core/src/registry.d.ts).

```ts
declare function getRegistrySnapshot(): RegistrySnapshot
```

### getSupportLabel

Source in the repository: `packages/core/src/support.ts`. [Packaged declaration](../dist/packages/core/src/support.d.ts).

```ts
declare function getSupportLabel(): string
```

### getTool

Source in the repository: `packages/core/src/registry.ts`. [Packaged declaration](../dist/packages/core/src/registry.d.ts).

```ts
declare function getTool(name: string): RegisteredTool | undefined
```

### inferFormInputSchema

Source in the repository: `packages/core/src/forms.ts`. [Packaged declaration](../dist/packages/core/src/forms.d.ts).

```ts
declare function inferFormInputSchema(form: HTMLFormElement): JsonSchema
```

### initWebMCP

Source in the repository: `packages/core/src/init.ts`. [Packaged declaration](../dist/packages/core/src/init.d.ts).

One-call setup: registers tools, defines and locates (or creates) the
command input element, and wires a planner.

An explicit `planner` takes precedence. Otherwise, `accessKey` requires
`model` and creates a hosted OpenAI planner with endpoints derived from
`baseUrl`. Without either, the element keeps its own planner behavior.

Tool names must be unique and must not collide with already-registered
tools. Failed setup removes registrations and elements added by that call.
`destroy()` performs the same cleanup and restores the previous confirmation
handler unless application code replaced it. Custom-element definition is
permanent; configuration on a reused element is not restored.

```ts
declare function initWebMCP(options?: InitWebMCPOptions): WebMCPInitHandle
```

### installWebMCPKitTestBridge

Source in the repository: `packages/core/src/test-bridge.ts`. [Packaged declaration](../dist/packages/core/src/test-bridge.d.ts).

```ts
declare function installWebMCPKitTestBridge(target?: Window): () => void
```

### integerParam

Source in the repository: `packages/core/src/schema-builders.ts`. [Packaged declaration](../dist/packages/core/src/schema-builders.d.ts).

```ts
declare function integerParam(options?: NumberParamOptions): JsonSchema
```

### invokeTool

Source in the repository: `packages/core/src/registry.ts`. [Packaged declaration](../dist/packages/core/src/registry.d.ts).

```ts
declare function invokeTool<TOutput = unknown>(
  invocation: ToolInvocation
): Promise<ToolInvocationResult<TOutput>>
```

### isPlannerOutcomeToolName

Source in the repository: `packages/core/src/plan-validation.ts`. [Packaged declaration](../dist/packages/core/src/plan-validation.d.ts).

```ts
declare function isPlannerOutcomeToolName(toolName: string): toolName is PlannerOutcomeToolName
```

### isWebMCPSupported

Source in the repository: `packages/core/src/support.ts`. [Packaged declaration](../dist/packages/core/src/support.d.ts).

```ts
declare function isWebMCPSupported(): boolean
```

### listTools

Source in the repository: `packages/core/src/registry.ts`. [Packaged declaration](../dist/packages/core/src/registry.d.ts).

```ts
declare function listTools(): RegisteredTool[]
```

### normalizeJsonText

Source in the repository: `packages/core/src/planner.ts`. [Packaged declaration](../dist/packages/core/src/planner.d.ts).

```ts
declare function normalizeJsonText(value: string, source?: string): string
```

### numberParam

Source in the repository: `packages/core/src/schema-builders.ts`. [Packaged declaration](../dist/packages/core/src/schema-builders.d.ts).

```ts
declare function numberParam(options?: NumberParamOptions): JsonSchema
```

### objectInputSchema

Source in the repository: `packages/core/src/schema-builders.ts`. [Packaged declaration](../dist/packages/core/src/schema-builders.d.ts).

```ts
declare function objectInputSchema(
  properties: Record<string, JsonSchema>,
  options?: ObjectInputSchemaOptions
): JsonSchema
```

### plannerOutcomeToolNames

Source in the repository: `packages/core/src/plan-validation.ts`. [Packaged declaration](../dist/packages/core/src/plan-validation.d.ts).

```ts
declare const plannerOutcomeToolNames: readonly ['needs_clarification', 'no_tools_match']
```

### registerFormTool

Source in the repository: `packages/core/src/forms.ts`. [Packaged declaration](../dist/packages/core/src/forms.d.ts).

```ts
declare function registerFormTool<TOutput = FormData>(
  options: RegisterFormToolOptions<TOutput>
): RegisteredTool<FormInput, TOutput>
```

### registerTool

Source in the repository: `packages/core/src/registry.ts`. [Packaged declaration](../dist/packages/core/src/registry.d.ts).

```ts
declare function registerTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>
): RegisteredTool<TInput, TOutput>
```

### setConfirmationHandler

Source in the repository: `packages/core/src/confirmation.ts`. [Packaged declaration](../dist/packages/core/src/confirmation.d.ts).

```ts
declare function setConfirmationHandler(handler: ConfirmationHandler | undefined): void
```

### stringParam

Source in the repository: `packages/core/src/schema-builders.ts`. [Packaged declaration](../dist/packages/core/src/schema-builders.d.ts).

```ts
declare function stringParam(options?: StringParamOptions): JsonSchema
```

### subscribeWebMCPKitEvents

Source in the repository: `packages/core/src/events.ts`. [Packaged declaration](../dist/packages/core/src/events.d.ts).

```ts
declare function subscribeWebMCPKitEvents(listener: Listener): () => void
```

### toolPlanSchema

Source in the repository: `packages/core/src/plan-validation.ts`. [Packaged declaration](../dist/packages/core/src/plan-validation.d.ts).

```ts
declare const toolPlanSchema: {
  type: string
  properties: {
    toolName: { type: string }
    input: { type: string }
    confidence: { type: string }
    reason: { type: string }
    steps: {
      type: string
      items: {
        type: string
        properties: {
          toolName: { type: string }
          input: { type: string }
          confidence: { type: string }
          reason: { type: string }
        }
        required: string[]
        additionalProperties: false
      }
      maxItems: number
    }
  }
  required: string[]
  additionalProperties: false
}
```

### unregisterTool

Source in the repository: `packages/core/src/registry.ts`. [Packaged declaration](../dist/packages/core/src/registry.d.ts).

```ts
declare function unregisterTool(name: string): boolean
```

### validateJsonSchema

Source in the repository: `packages/core/src/schema.ts`. [Packaged declaration](../dist/packages/core/src/schema.d.ts).

```ts
declare function validateJsonSchema(schema: JsonSchema, path?: string): string[]
```

### validateJsonValue

Source in the repository: `packages/core/src/schema.ts`. [Packaged declaration](../dist/packages/core/src/schema.d.ts).

```ts
declare function validateJsonValue(value: unknown, schema: JsonSchema, path?: string): string[]
```

### validateToolPlan

Source in the repository: `packages/core/src/plan-validation.ts`. [Packaged declaration](../dist/packages/core/src/plan-validation.d.ts).

```ts
declare function validateToolPlan(
  plan: unknown,
  tools: ToolPlanValidationTool[],
  options?: ToolPlanValidationOptions
): void
```

## @vampaz/webmcp-kit/devtools

### DevtoolsOverlay

Source in the repository: `packages/devtools/src/devtools.ts`. [Packaged declaration](../dist/packages/devtools/src/devtools.d.ts).

```ts
export interface DevtoolsOverlay {
  refresh: () => void
  destroy: () => void
}
```

### MountDevtoolsOptions

Source in the repository: `packages/devtools/src/devtools.ts`. [Packaged declaration](../dist/packages/devtools/src/devtools.d.ts).

```ts
export interface MountDevtoolsOptions {
  container?: HTMLElement
  initiallyOpen?: boolean
  placement?: 'fixed' | 'inline'
}
```

### mountDevtoolsOverlay

Source in the repository: `packages/devtools/src/devtools.ts`. [Packaged declaration](../dist/packages/devtools/src/devtools.d.ts).

```ts
declare function mountDevtoolsOverlay(options?: MountDevtoolsOptions): DevtoolsOverlay
```

## @vampaz/webmcp-kit/mcp-bridge

### MCPBridge

Source in the repository: `packages/mcp-bridge/src/index.ts`. [Packaged declaration](../dist/packages/mcp-bridge/src/index.d.ts).

```ts
export interface MCPBridge {
  listTools: () => MCPBridgeTool[]
  callTool: (name: string, input: Record<string, unknown>) => Promise<ToolInvocationResult>
  handleRequest: (request: MCPBridgeRequest) => Promise<MCPBridgeResponse>
}
```

### MCPBridgeRequest

Source in the repository: `packages/mcp-bridge/src/index.ts`. [Packaged declaration](../dist/packages/mcp-bridge/src/index.d.ts).

```ts
export interface MCPBridgeRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: 'tools/list' | 'tools/call'
  params?: Record<string, unknown>
}
```

### MCPBridgeResponse

Source in the repository: `packages/mcp-bridge/src/index.ts`. [Packaged declaration](../dist/packages/mcp-bridge/src/index.d.ts).

```ts
export interface MCPBridgeResponse {
  jsonrpc: '2.0'
  id?: string | number | null
  result?: unknown
  error?: {
    code: number
    message: string
  }
}
```

### MCPBridgeTool

Source in the repository: `packages/mcp-bridge/src/index.ts`. [Packaged declaration](../dist/packages/mcp-bridge/src/index.d.ts).

```ts
export interface MCPBridgeTool {
  name: string
  description: string
  inputSchema: JsonSchema
}
```

### createLocalMCPBridge

Source in the repository: `packages/mcp-bridge/src/index.ts`. [Packaged declaration](../dist/packages/mcp-bridge/src/index.d.ts).

```ts
declare function createLocalMCPBridge(): MCPBridge
```

## @vampaz/webmcp-kit/react

### ReactWebMCPTool

Source in the repository: `packages/react/src/interfaces/webmcp-tool.ts`. [Packaged declaration](../dist/packages/react/src/interfaces/webmcp-tool.d.ts).

```ts
export type ReactWebMCPTool<TInput = Record<string, unknown>, TOutput = unknown> = WebMCPTool<
  TInput,
  TOutput
>
```

### UseWebMCPToolOptions

Source in the repository: `packages/react/src/interfaces/webmcp-tool.ts`. [Packaged declaration](../dist/packages/react/src/interfaces/webmcp-tool.d.ts).

```ts
export interface UseWebMCPToolOptions {
  when?: boolean
}
```

### UseWebMCPToolResult

Source in the repository: `packages/react/src/interfaces/webmcp-tool.ts`. [Packaged declaration](../dist/packages/react/src/interfaces/webmcp-tool.d.ts).

```ts
export interface UseWebMCPToolResult<TInput = Record<string, unknown>, TOutput = unknown> {
  unregister: () => void
  getRegistration: () => RegisteredTool<TInput, TOutput> | undefined
}
```

### useWebMCPTool

Source in the repository: `packages/react/src/index.ts`. [Packaged declaration](../dist/packages/react/src/index.d.ts).

```ts
declare function useWebMCPTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>,
  options?: UseWebMCPToolOptions
): UseWebMCPToolResult<TInput, TOutput>
```

## @vampaz/webmcp-kit/svelte

### SvelteWebMCPTool

Source in the repository: `packages/svelte/src/interfaces/webmcp-tool.ts`. [Packaged declaration](../dist/packages/svelte/src/interfaces/webmcp-tool.d.ts).

```ts
export type SvelteWebMCPTool<TInput = Record<string, unknown>, TOutput = unknown> = WebMCPTool<
  TInput,
  TOutput
>
```

### UseWebMCPToolOptions

Source in the repository: `packages/svelte/src/interfaces/webmcp-tool.ts`. [Packaged declaration](../dist/packages/svelte/src/interfaces/webmcp-tool.d.ts).

```ts
export interface UseWebMCPToolOptions {
  when?: boolean | (() => boolean) | Readable<boolean>
}
```

### UseWebMCPToolResult

Source in the repository: `packages/svelte/src/interfaces/webmcp-tool.ts`. [Packaged declaration](../dist/packages/svelte/src/interfaces/webmcp-tool.d.ts).

```ts
export interface UseWebMCPToolResult<TInput = Record<string, unknown>, TOutput = unknown> {
  unregister: () => void
  getRegistration: () => RegisteredTool<TInput, TOutput> | undefined
}
```

### useWebMCPTool

Source in the repository: `packages/svelte/src/index.ts`. [Packaged declaration](../dist/packages/svelte/src/index.d.ts).

```ts
declare function useWebMCPTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>,
  options?: UseWebMCPToolOptions
): UseWebMCPToolResult<TInput, TOutput>
```

## @vampaz/webmcp-kit/testing

### WebMCPPlannerEvalCase

Source in the repository: `packages/testing/src/interfaces/evals.ts`. [Packaged declaration](../dist/packages/testing/src/interfaces/evals.d.ts).

```ts
export type WebMCPPlannerEvalCase = WebMCPPlannerEvalCaseBase &
  (
    | {
        expectedToolName: string
        expectedOutcome?: never
      }
    | {
        expectedToolName?: never
        expectedOutcome: WebMCPPlannerOutcome
      }
  )
```

### WebMCPPlannerEvalCaseBase

Source in the repository: `packages/testing/src/interfaces/evals.ts`. [Packaged declaration](../dist/packages/testing/src/interfaces/evals.d.ts).

```ts
export interface WebMCPPlannerEvalCaseBase {
  name: string
  message: string
  context?: PlannerContext
  expectedInput?: Record<string, unknown>
  expectedInputSubset?: Record<string, unknown>
  expectedSteps?: WebMCPPlannerEvalStepExpectation[]
}
```

### WebMCPPlannerEvalCaseSummary

Source in the repository: `packages/testing/src/interfaces/evals.ts`. [Packaged declaration](../dist/packages/testing/src/interfaces/evals.d.ts).

```ts
export interface WebMCPPlannerEvalCaseSummary {
  name: string
  runs: number
  passes: number
  passRate: number
  passed: boolean
  averageDurationMs: number
  results: WebMCPPlannerEvalResult[]
}
```

### WebMCPPlannerEvalResult

Source in the repository: `packages/testing/src/interfaces/evals.ts`. [Packaged declaration](../dist/packages/testing/src/interfaces/evals.d.ts).

```ts
export interface WebMCPPlannerEvalResult {
  name: string
  passed: boolean
  message: string
  durationMs: number
  plan?: ToolPlan
  errors: string[]
}
```

### WebMCPPlannerEvalStepExpectation

Source in the repository: `packages/testing/src/interfaces/evals.ts`. [Packaged declaration](../dist/packages/testing/src/interfaces/evals.d.ts).

```ts
export interface WebMCPPlannerEvalStepExpectation {
  toolName: string
  inputSubset?: Record<string, unknown>
}
```

### WebMCPPlannerEvalSuiteOptions

Source in the repository: `packages/testing/src/interfaces/evals.ts`. [Packaged declaration](../dist/packages/testing/src/interfaces/evals.d.ts).

```ts
export interface WebMCPPlannerEvalSuiteOptions {
  minimumPassRate?: number
  runsPerCase?: number
}
```

### WebMCPPlannerEvalSuiteResult

Source in the repository: `packages/testing/src/interfaces/evals.ts`. [Packaged declaration](../dist/packages/testing/src/interfaces/evals.d.ts).

```ts
export interface WebMCPPlannerEvalSuiteResult {
  plannerName: string
  passed: boolean
  minimumPassRate: number
  runsPerCase: number
  caseResults: WebMCPPlannerEvalCaseSummary[]
}
```

### WebMCPPlannerOutcome

Source in the repository: `packages/testing/src/interfaces/evals.ts`. [Packaged declaration](../dist/packages/testing/src/interfaces/evals.d.ts).

```ts
export type WebMCPPlannerOutcome = 'needs_clarification' | 'no_tools_match'
```

### getWebMCPRegistrySnapshot

Source in the repository: `packages/testing/src/playwright.ts`. [Packaged declaration](../dist/packages/testing/src/playwright.d.ts).

```ts
declare function getWebMCPRegistrySnapshot(page: WebMCPTestingPage): Promise<TestBridgeSnapshot>
```

### invokeWebMCPTool

Source in the repository: `packages/testing/src/playwright.ts`. [Packaged declaration](../dist/packages/testing/src/playwright.d.ts).

```ts
declare function invokeWebMCPTool<TOutput = unknown>(
  page: WebMCPTestingPage,
  invocation: ToolInvocation
): Promise<ToolInvocationResult<TOutput>>
```

### listWebMCPTools

Source in the repository: `packages/testing/src/playwright.ts`. [Packaged declaration](../dist/packages/testing/src/playwright.d.ts).

```ts
declare function listWebMCPTools(page: WebMCPTestingPage): Promise<TestBridgeTool[]>
```

### runWebMCPPlannerEvalCase

Source in the repository: `packages/testing/src/evals.ts`. [Packaged declaration](../dist/packages/testing/src/evals.d.ts).

```ts
declare function runWebMCPPlannerEvalCase(
  planner: ToolPlanner,
  tools: readonly AnyWebMCPTool[],
  testCase: WebMCPPlannerEvalCase
): Promise<WebMCPPlannerEvalResult>
```

### runWebMCPPlannerEvalSuite

Source in the repository: `packages/testing/src/evals.ts`. [Packaged declaration](../dist/packages/testing/src/evals.d.ts).

```ts
declare function runWebMCPPlannerEvalSuite(
  planner: ToolPlanner,
  tools: readonly AnyWebMCPTool[],
  testCases: readonly WebMCPPlannerEvalCase[],
  options?: WebMCPPlannerEvalSuiteOptions
): Promise<WebMCPPlannerEvalSuiteResult>
```

### runWebMCPPlannerEvals

Source in the repository: `packages/testing/src/evals.ts`. [Packaged declaration](../dist/packages/testing/src/evals.d.ts).

```ts
declare function runWebMCPPlannerEvals(
  planner: ToolPlanner,
  tools: readonly AnyWebMCPTool[],
  testCases: readonly WebMCPPlannerEvalCase[]
): Promise<WebMCPPlannerEvalResult[]>
```

### waitForWebMCPTool

Source in the repository: `packages/testing/src/playwright.ts`. [Packaged declaration](../dist/packages/testing/src/playwright.d.ts).

```ts
declare function waitForWebMCPTool(
  page: WebMCPTestingPage,
  toolName: string
): Promise<TestBridgeTool>
```

## @vampaz/webmcp-kit/testing/playwright

### WebMCPTestingPage

Source in the repository: `packages/testing/src/playwright.ts`. [Packaged declaration](../dist/packages/testing/src/playwright.d.ts).

```ts
export interface WebMCPTestingPage {
  evaluate<TResult>(pageFunction: () => TResult | Promise<TResult>): Promise<TResult>
  evaluate<TArg, TResult>(
    pageFunction: (arg: TArg) => TResult | Promise<TResult>,
    arg: TArg
  ): Promise<TResult>
  waitForFunction<TArg>(
    pageFunction: (arg: TArg) => unknown,
    arg: TArg
  ): Promise<{
    jsonValue(): Promise<unknown>
  }>
}
```

### getWebMCPRegistrySnapshot

Source in the repository: `packages/testing/src/playwright.ts`. [Packaged declaration](../dist/packages/testing/src/playwright.d.ts).

```ts
declare function getWebMCPRegistrySnapshot(page: WebMCPTestingPage): Promise<TestBridgeSnapshot>
```

### invokeWebMCPTool

Source in the repository: `packages/testing/src/playwright.ts`. [Packaged declaration](../dist/packages/testing/src/playwright.d.ts).

```ts
declare function invokeWebMCPTool<TOutput = unknown>(
  page: WebMCPTestingPage,
  invocation: ToolInvocation
): Promise<ToolInvocationResult<TOutput>>
```

### listWebMCPTools

Source in the repository: `packages/testing/src/playwright.ts`. [Packaged declaration](../dist/packages/testing/src/playwright.d.ts).

```ts
declare function listWebMCPTools(page: WebMCPTestingPage): Promise<TestBridgeTool[]>
```

### waitForWebMCPTool

Source in the repository: `packages/testing/src/playwright.ts`. [Packaged declaration](../dist/packages/testing/src/playwright.d.ts).

```ts
declare function waitForWebMCPTool(
  page: WebMCPTestingPage,
  toolName: string
): Promise<TestBridgeTool>
```

## @vampaz/webmcp-kit/vue

### UseWebMCPToolOptions

Source in the repository: `packages/vue/src/interfaces/webmcp-tool.ts`. [Packaged declaration](../dist/packages/vue/src/interfaces/webmcp-tool.d.ts).

```ts
export interface UseWebMCPToolOptions {
  when?: MaybeRefOrGetter<boolean>
}
```

### UseWebMCPToolResult

Source in the repository: `packages/vue/src/interfaces/webmcp-tool.ts`. [Packaged declaration](../dist/packages/vue/src/interfaces/webmcp-tool.d.ts).

```ts
export interface UseWebMCPToolResult<TInput = Record<string, unknown>, TOutput = unknown> {
  unregister: () => void
  getRegistration: () => RegisteredTool<TInput, TOutput> | undefined
}
```

### VueWebMCPTool

Source in the repository: `packages/vue/src/interfaces/webmcp-tool.ts`. [Packaged declaration](../dist/packages/vue/src/interfaces/webmcp-tool.d.ts).

```ts
export type VueWebMCPTool<TInput = Record<string, unknown>, TOutput = unknown> = WebMCPTool<
  TInput,
  TOutput
>
```

### useWebMCPTool

Source in the repository: `packages/vue/src/index.ts`. [Packaged declaration](../dist/packages/vue/src/index.d.ts).

```ts
declare function useWebMCPTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>,
  options?: UseWebMCPToolOptions
): UseWebMCPToolResult<TInput, TOutput>
```

## @vampaz/webmcp-kit/zod

### DefineZodToolOptions

Source in the repository: `packages/zod/src/interfaces/zod-tool.ts`. [Packaged declaration](../dist/packages/zod/src/interfaces/zod-tool.d.ts).

```ts
export interface DefineZodToolOptions<TSchema extends z.ZodType, TOutput = unknown> {
  name: string
  description: string
  schema: TSchema
  outputSchema?: JsonSchema
  annotations?: ToolAnnotations
  confirmation?: ToolConfirmation
  examples?: Array<z.infer<TSchema>>
  scope?: () => ToolScopeResult
  guard?: (input: z.infer<TSchema>) => boolean | string | Promise<boolean | string>
  execute: (input: z.infer<TSchema>, context: ToolContext) => Promise<TOutput> | TOutput
}
```

### ZodWebMCPTool

Source in the repository: `packages/zod/src/interfaces/zod-tool.ts`. [Packaged declaration](../dist/packages/zod/src/interfaces/zod-tool.d.ts).

```ts
export type ZodWebMCPTool<TSchema extends z.ZodType, TOutput = unknown> = WebMCPTool<
  z.infer<TSchema>,
  TOutput
>
```

### defineZodTool

Source in the repository: `packages/zod/src/index.ts`. [Packaged declaration](../dist/packages/zod/src/index.d.ts).

```ts
declare function defineZodTool<TSchema extends z.ZodType, TOutput = unknown>(
  options: DefineZodToolOptions<TSchema, TOutput>
): ZodWebMCPTool<TSchema, TOutput>
```

## @vampaz/webmcp-kit/pi

### PiController

Source in the repository: `packages/pi/src/interfaces/controller.ts`. [Packaged declaration](../dist/packages/pi/src/interfaces/controller.d.ts).

```ts
export interface PiController {
  getSnapshot(): PiSnapshot
  subscribe(listener: (snapshot: PiSnapshot) => void): () => void
  send(text: string): Promise<PiTurnOutcome>
  stop(): Promise<void>
  clear(): Promise<void>
  destroy(): Promise<void>
}
```

### PiError

Source in the repository: `packages/pi/src/interfaces/controller.ts`. [Packaged declaration](../dist/packages/pi/src/interfaces/controller.d.ts).

```ts
export interface PiError {
  code: PiErrorCode
  message: string
}
```

### PiErrorCode

Source in the repository: `packages/pi/src/interfaces/controller.ts`. [Packaged declaration](../dist/packages/pi/src/interfaces/controller.d.ts).

```ts
export type PiErrorCode =
  | 'unsupported'
  | 'configuration'
  | 'storage_failed'
  | 'provider_failed'
  | 'stale_document'
  | 'action_denied'
  | 'tool_failed'
  | 'limit_reached'
  | 'conversation_busy'
  | 'transport_failed'
```

### PiHarnessOptions

Source in the repository: `packages/pi/src/interfaces/controller.ts`. [Packaged declaration](../dist/packages/pi/src/interfaces/controller.d.ts).

```ts
export interface PiHarnessOptions {
  session: PiSession
  worker: { url: string | URL; scope: string }
  planner: ToolPlanner
  context?: () => PlannerContext | Promise<PlannerContext>
  host?: PiToolHost
  limits?: PiLimits
  /** Called when pending application approval UI must close. */
  onCancel?: () => void
}
```

### PiLimits

Source in the repository: `packages/pi/src/interfaces/session.ts`. [Packaged declaration](../dist/packages/pi/src/interfaces/session.d.ts).

```ts
export interface PiLimits {
  /** 1–50; default 12. */
  maxToolCalls?: number
  /** UTF-8 bytes in the durable commit log; default 8 MiB. */
  maxHistoryBytes?: number
  /** UTF-8 bytes per planner request; default 128 KiB. */
  maxRequestBytes?: number
}
```

### PiMessage

Source in the repository: `packages/pi/src/interfaces/controller.ts`. [Packaged declaration](../dist/packages/pi/src/interfaces/controller.d.ts).

```ts
export interface PiMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  text: string
  toolName?: string
  failed?: boolean
}
```

### PiRuntimeOptions

Source in the repository: `packages/pi/src/interfaces/controller.ts`. [Packaged declaration](../dist/packages/pi/src/interfaces/controller.d.ts).

```ts
export interface PiRuntimeOptions {
  session: PiSession
  planner: ToolPlanner
  host: PiToolHost
  limits?: PiLimits
}
```

### PiSession

Source in the repository: `packages/pi/src/interfaces/session.ts`. [Packaged declaration](../dist/packages/pi/src/interfaces/session.d.ts).

```ts
export interface PiSession {
  namespace: string
  ownerId: string
  conversationId: string
}
```

### PiSnapshot

Source in the repository: `packages/pi/src/interfaces/controller.ts`. [Packaged declaration](../dist/packages/pi/src/interfaces/controller.d.ts).

```ts
export interface PiSnapshot {
  state: PiState
  messages: readonly PiMessage[]
  error?: PiError
}
```

### PiState

Source in the repository: `packages/pi/src/interfaces/controller.ts`. [Packaged declaration](../dist/packages/pi/src/interfaces/controller.d.ts).

```ts
export type PiState =
  | 'loading'
  | 'idle'
  | 'running'
  | 'stopping'
  | 'interrupted'
  | 'error'
  | 'closed'
```

### PiToolCatalog

Source in the repository: `packages/pi/src/interfaces/host.ts`. [Packaged declaration](../dist/packages/pi/src/interfaces/host.d.ts).

```ts
export interface PiToolCatalog {
  revision: string
  tools: PiToolDescription[]
}
```

### PiToolDescription

Source in the repository: `packages/pi/src/interfaces/host.ts`. [Packaged declaration](../dist/packages/pi/src/interfaces/host.d.ts).

```ts
export interface PiToolDescription {
  name: string
  description: string
  inputSchema: JsonSchema
}
```

### PiToolHost

Source in the repository: `packages/pi/src/interfaces/host.ts`. [Packaged declaration](../dist/packages/pi/src/interfaces/host.d.ts).

```ts
export interface PiToolHost {
  discover(signal: AbortSignal): Promise<PiToolCatalog>
  context(signal: AbortSignal): Promise<PlannerContext>
  invoke(
    call: { name: string; input: Record<string, unknown>; revision: string },
    signal: AbortSignal
  ): Promise<ToolInvocationResult>
}
```

### PiTurnOutcome

Source in the repository: `packages/pi/src/interfaces/controller.ts`. [Packaged declaration](../dist/packages/pi/src/interfaces/controller.d.ts).

```ts
export interface PiTurnOutcome {
  status: 'completed' | 'interrupted' | 'error'
  error?: PiError
}
```

### createPiHarness

Source in the repository: `packages/pi/src/connection.ts`. [Packaged declaration](../dist/packages/pi/src/connection.d.ts).

```ts
declare function createPiHarness(options: PiHarnessOptions): Promise<PiController>
```

### createPiRuntime

Source in the repository: `packages/pi/src/runtime.ts`. [Packaged declaration](../dist/packages/pi/src/runtime.d.ts).

```ts
declare function createPiRuntime(options: PiRuntimeOptions): Promise<PiController>
```

### createRegistryToolHost

Source in the repository: `packages/pi/src/tool-host.ts`. [Packaged declaration](../dist/packages/pi/src/tool-host.d.ts).

```ts
declare function createRegistryToolHost(
  context?: () => PlannerContext | Promise<PlannerContext>
): PiToolHost
```

## @vampaz/webmcp-kit/pi/worker

### installPiServiceWorker

Source in the repository: `packages/pi/src/worker.ts`. [Packaged declaration](../dist/packages/pi/src/worker.d.ts).

```ts
declare function installPiServiceWorker(scope?: ServiceWorkerGlobalScope): () => void
```

## @vampaz/webmcp-kit/chat

### WebMCPChatElement

Source in the repository: `packages/chat/src/interfaces/chat.ts`. [Packaged declaration](../dist/packages/chat/src/interfaces/chat.d.ts).

```ts
export interface WebMCPChatElement extends HTMLElement {
  configure(options: WebMCPChatOptions): void
}
```

### WebMCPChatOptions

Source in the repository: `packages/chat/src/interfaces/chat.ts`. [Packaged declaration](../dist/packages/chat/src/interfaces/chat.d.ts).

```ts
export interface WebMCPChatOptions {
  harness: PiController
  mode?: 'inline' | 'popup'
  title?: string
  assistantLabel?: string
  placeholder?: string
  emptyState?: string
  suggestedPrompts?: readonly string[]
  disabled?: boolean
}
```

### defineWebMCPChat

Source in the repository: `packages/chat/src/chat.ts`. [Packaged declaration](../dist/packages/chat/src/chat.d.ts).

```ts
declare function defineWebMCPChat(): void
```

## Supporting types

These types are referenced by exported contracts. Use the owning public type to access them; do not import internal source paths.

### UnknownToRecord

Source in the repository: `packages/core/src/interfaces/schema-inference.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/schema-inference.d.ts).

```ts
type UnknownToRecord<T> = [unknown] extends [T] ? Record<string, unknown> : T
```

### InferJsonSchemaType

Source in the repository: `packages/core/src/interfaces/schema-inference.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/schema-inference.d.ts).

```ts
type InferJsonSchemaType<S> = S extends { const: infer C }
  ? C
  : S extends { enum: readonly (infer E)[] }
    ? E
    : S extends { anyOf: readonly (infer A)[] }
      ? InferJsonSchemaType<A>
      : S extends { oneOf: readonly (infer O)[] }
        ? InferJsonSchemaType<O>
        : S extends { type: infer T }
          ? T extends readonly string[]
            ? InferNamedType<T[number], S>
            : InferNamedType<T, S>
          : unknown
```

### PlannerRunOptions

Source in the repository: `packages/core/src/interfaces/tool.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/tool.d.ts).

```ts
export interface PlannerRunOptions {
  signal?: AbortSignal
  singleStep?: boolean
  /** Maximum UTF-8 bytes in the serialized planner request, including prompt/schema overhead. */
  maxRequestBytes?: number
}
```

### WebMCPCommandInputRunOptions

Source in the repository: `packages/core/src/interfaces/command-input.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/command-input.d.ts).

```ts
export interface WebMCPCommandInputRunOptions {
  signal?: AbortSignal
}
```

### CatalogRegistration

Source in the repository: `packages/core/src/adapters/catalog.ts`. [Packaged declaration](../dist/packages/core/src/adapters/catalog.d.ts).

```ts
interface CatalogRegistration {
  tool: {
    name: string
    description: string
    inputSchema: JsonSchema
    outputSchema?: JsonSchema
    confirmation?: ToolConfirmation
    examples?: unknown[]
    scope?: () => ToolScopeResult
  }
  mode: RegisteredTool['mode']
  warnings: string[]
}
```

### CommandInputConstructor

Source in the repository: `packages/core/src/command-input.ts`. [Packaged declaration](../dist/packages/core/src/command-input.d.ts).

```ts
type CommandInputConstructor = CustomElementConstructor & {
  observedAttributes: string[]
}
```

### Listener

Source in the repository: `packages/core/src/events.ts`. [Packaged declaration](../dist/packages/core/src/events.d.ts).

```ts
type Listener = (event: WebMCPKitEvent) => void
```

### InferNamedType

Source in the repository: `packages/core/src/interfaces/schema-inference.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/schema-inference.d.ts).

```ts
type InferNamedType<T, S> = T extends 'string'
  ? string
  : T extends 'number' | 'integer'
    ? number
    : T extends 'boolean'
      ? boolean
      : T extends 'null'
        ? null
        : T extends 'array'
          ? InferArrayType<S>
          : T extends 'object'
            ? InferObjectType<S>
            : unknown
```

### InferArrayType

Source in the repository: `packages/core/src/interfaces/schema-inference.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/schema-inference.d.ts).

```ts
type InferArrayType<S> = S extends { items: infer I } ? InferJsonSchemaType<I>[] : unknown[]
```

### InferObjectType

Source in the repository: `packages/core/src/interfaces/schema-inference.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/schema-inference.d.ts).

```ts
type InferObjectType<S> = S extends { properties: infer P }
  ? Simplify<
      { [K in RequiredPropertyKeys<S, P>]: InferJsonSchemaType<P[K]> } & {
        [K in OptionalPropertyKeys<S, P>]?: InferJsonSchemaType<P[K]>
      }
    >
  : Record<string, unknown>
```

### Simplify

Source in the repository: `packages/core/src/interfaces/schema-inference.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/schema-inference.d.ts).

```ts
type Simplify<T> = { [K in keyof T]: T[K] } & {}
```

### RequiredPropertyKeys

Source in the repository: `packages/core/src/interfaces/schema-inference.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/schema-inference.d.ts).

```ts
type RequiredPropertyKeys<S, P> = S extends { required: readonly (infer R)[] }
  ? Extract<keyof P, R>
  : never
```

### OptionalPropertyKeys

Source in the repository: `packages/core/src/interfaces/schema-inference.ts`. [Packaged declaration](../dist/packages/core/src/interfaces/schema-inference.d.ts).

```ts
type OptionalPropertyKeys<S, P> = Exclude<keyof P, RequiredPropertyKeys<S, P>>
```
