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

- [`@vampaz/webmcp-kit/chat`](#vampazwebmcp-kitchat)

- [`@vampaz/webmcp-kit/command-input`](#vampazwebmcp-kitcommand-input)

- [`@vampaz/webmcp-kit/hosted`](#vampazwebmcp-kithosted)

## @vampaz/webmcp-kit

### ArrayParamOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/schema-builders.ts).

```ts
export interface ArrayParamOptions {
  description?: string
  maxItems?: number
  minItems?: number
}
```

### ConfirmationEventDetail

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

Detail of `confirmation-requested` and `confirmation-settled` events.

```ts
export interface ConfirmationEventDetail {
  id: string
  toolName: string
  source: ToolContext['source']
  /** Set on `confirmation-settled`. */
  approved?: boolean
}
```

### ConfirmationHandler

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export type ConfirmationHandler = (request: ConfirmationRequest) => boolean | Promise<boolean>
```

### ConfirmationRequest

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export interface ConfirmationRequest {
  tool: ConfirmationTool
  input: unknown
  reason: string
  signal?: AbortSignal
}
```

### ConfirmationTool

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export interface ConfirmationTool {
  name: string
  description: string
  inputSchema: JsonSchema
  confirmation?: ToolConfirmation
}
```

### DefineServerToolOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/server-tool.ts).

```ts
export interface DefineServerToolOptions<TInput = Record<string, unknown>, TOutput = unknown>
  extends Omit<WebMCPTool<TInput, TOutput>, 'execute'>, ServerToolEndpointOptions {}
```

### FormInput

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/forms.ts).

```ts
export type FormInput = Record<string, string | number | boolean | string[]>
```

### InferToolInput

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/schema-inference.ts).

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

### IntegrationDiagnostic

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

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

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/diagnostics.ts).

```ts
export interface IntegrationHealthOptions {
  resolver?: ToolResolver
}
```

### IntegrationHealthReport

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

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

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export interface JsonSchema {
  type?: string | readonly string[]
  properties?: Record<string, JsonSchema>
  required?: readonly string[]
  items?: JsonSchema
  prefixItems?: readonly JsonSchema[]
  anyOf?: readonly JsonSchema[]
  oneOf?: readonly JsonSchema[]
  allOf?: readonly JsonSchema[]
  not?: JsonSchema
  enum?: readonly unknown[]
  const?: unknown
  title?: string
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  multipleOf?: number
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
  minProperties?: number
  maxProperties?: number
  propertyNames?: JsonSchema
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: string
  description?: string
  additionalProperties?: boolean | JsonSchema
  [key: string]: unknown
}
```

### LmStudioModelOption

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/model.ts).

```ts
export interface LmStudioModelOption {
  model: string
  label: string
  loaded: boolean
}
```

### NumberParamOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/schema-builders.ts).

```ts
export interface NumberParamOptions {
  description?: string
  maximum?: number
  minimum?: number
}
```

### ObjectInputSchemaOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/schema-builders.ts).

```ts
export interface ObjectInputSchemaOptions<TRequired extends readonly string[] = readonly string[]> {
  additionalProperties?: boolean | JsonSchema
  required?: TRequired
}
```

### OpenAIFunctionTool

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/adapters/openai.ts).

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

### RegisterFormToolFieldOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/forms.ts).

```ts
export interface RegisterFormToolFieldOptions {
  title?: string
  description?: string
}
```

### RegisterFormToolOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/forms.ts).

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

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export interface RegisteredTool<TInput = Record<string, unknown>, TOutput = unknown> {
  tool: WebMCPTool<TInput, TOutput>
  mode: 'native-and-fallback' | 'fallback'
  warnings: string[]
  ready: Promise<void>
  unregister: () => void
}
```

### RegisteredTools

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export interface RegisteredTools {
  registrations: RegisteredTool[]
  unregister: () => void
}
```

### RegistrySnapshot

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export interface RegistrySnapshot {
  supportLabel: string
  nativeWebMCP: boolean
  toolCount: number
  tools: RegisteredTool[]
}
```

### RemoteResolverConfig

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export interface RemoteResolverConfig {
  provider: 'openai' | 'openrouter' | 'openai-compatible' | 'cloudflare-binding'
  model?: string
  baseUrl?: string
  auth?: ResolverAuth
  responseFormat?: 'json_object' | 'json_schema' | 'text'
  maxTokens?: number
  temperature?: number
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
  /** Provider-reported limits for a model not covered by built-in discovery. */
  modelLimits?: ResolverModelLimits
}
```

### ResolverAuth

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export type ResolverAuth =
  | { mode: 'none' }
  | { mode: 'server'; endpoint: string }
  | { mode: 'user-key'; apiKey?: string; storageKey?: string }
```

### ResolverContext

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export interface ResolverContext {
  [key: string]: unknown
}
```

### ResolverError

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/resolver-error.ts).

A provider failure with a stable code, so callers need not parse provider prose.

```ts
declare class ResolverError extends Error {
  readonly code: ResolverErrorCode
  readonly status?: number
  constructor(message: string, code: ResolverErrorCode, status?: number)
}
```

### ResolverErrorCode

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/resolver-error.ts).

```ts
export type ResolverErrorCode = 'context_overflow' | 'provider_failed'
```

### ResolverModelLimits

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export interface ResolverModelLimits {
  /** Actual context window, including input and output tokens. */
  contextWindow: number
  maxInputTokens?: number
  maxOutputTokens?: number
}
```

### ResolverOutcomeToolName

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/resolution-validation.ts).

```ts
export type ResolverOutcomeToolName = (typeof resolverOutcomeToolNames)[number]
```

### ResolverProviderConfig

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export type ResolverProviderConfig =
  | { provider: 'auto' }
  | { provider: 'chrome-built-in' }
  | { provider: 'local' }
  | RemoteResolverConfig
```

### ResolverProviderKind

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export type ResolverProviderKind =
  | 'auto'
  | 'chrome-built-in'
  | 'local'
  | 'openai'
  | 'openrouter'
  | 'openai-compatible'
  | 'cloudflare-binding'
```

### ResolverRequest

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export interface ResolverRequest {
  message: string
  tools: WebMCPTool[]
  context: ResolverContext
}
```

### ResolverRunOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export interface ResolverRunOptions {
  signal?: AbortSignal
  singleStep?: boolean
  /** Summarize history through the offered tool, without action selection or resolver outcomes. */
  purpose?: 'summary'
  /** Maximum UTF-8 bytes in the serialized resolver request, including prompt/schema overhead. */
  maxRequestBytes?: number
}
```

### SchemaTypedServerToolOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/server-tool.ts).

```ts
export type SchemaTypedServerToolOptions<TSchema extends JsonSchema, TOutput = unknown> = Omit<
  SchemaTypedWebMCPTool<TSchema, TOutput>,
  'execute'
> &
  ServerToolEndpointOptions
```

### SchemaTypedWebMCPTool

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/define-tool.ts).

```ts
export type SchemaTypedWebMCPTool<TSchema extends JsonSchema, TOutput = unknown> = Omit<
  WebMCPTool<InferToolInput<TSchema>, TOutput>,
  'inputSchema' | 'execute' | 'guard'
> & {
  inputSchema: TSchema
  execute: (
    input: NoInfer<InferToolInput<TSchema>>,
    context: import('./interfaces/tool').ToolContext
  ) => TOutput | Promise<TOutput>
  guard?: (input: NoInfer<InferToolInput<TSchema>>) => boolean | string | Promise<boolean | string>
}
```

### ServerToolEndpointOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/server-tool.ts).

```ts
export interface ServerToolEndpointOptions {
  endpoint: string | URL
  fetch?: ServerToolFetch
  headers?: Record<string, string>
}
```

### ServerToolFetch

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/server-tool.ts).

```ts
export type ServerToolFetch = (input: string | URL, init?: RequestInit) => Promise<Response>
```

### StringParamOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/schema-builders.ts).

```ts
export interface StringParamOptions {
  description?: string
  maxLength?: number
  minLength?: number
  pattern?: string
}
```

### ToolAnnotations

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export interface ToolAnnotations {
  readOnlyHint?: boolean
  untrustedContentHint?: boolean
  [key: string]: unknown
}
```

### ToolCatalog

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/adapters/catalog.ts).

```ts
export interface ToolCatalog {
  title: string
  tools: ToolCatalogEntry[]
}
```

### ToolCatalogEntry

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/adapters/catalog.ts).

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

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/adapters/catalog.ts).

```ts
export interface ToolCatalogOptions {
  title?: string
}
```

### ToolConfirmation

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export interface ToolConfirmation {
  reason: string
  handler?: ConfirmationHandler
}
```

### ToolContext

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export interface ToolContext {
  source: 'native' | 'fallback' | 'devtools' | 'resolver' | 'pi' | 'mcp-bridge'
  signal?: AbortSignal
}
```

### ToolExecutionError

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/tool-execution-error.ts).

An application failure whose JSON details must reach the agent, including partial results.

```ts
declare class ToolExecutionError extends Error {
  readonly code: ToolInvocationErrorCode
  readonly details?: Record<string, unknown>
  constructor(code: ToolInvocationErrorCode, message: string, details?: Record<string, unknown>)
}
```

### ToolInvocation

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export interface ToolInvocation<TInput = Record<string, unknown>> {
  id?: string
  toolName: string
  input: TInput
  source?: ToolContext['source']
  signal?: AbortSignal
}
```

### ToolInvocationErrorCode

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

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
  | 'resolver_failed'
  | 'scope_failed'
  | 'scope_unavailable'
```

### ToolInvocationResult

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export interface ToolInvocationResult<TOutput = unknown> {
  invocationId?: string
  toolName: string
  status: 'success' | 'error' | 'blocked' | 'unavailable'
  code?: ToolInvocationErrorCode
  output?: TOutput
  error?: string
  details?: Record<string, unknown>
  durationMs: number
}
```

### ToolResolution

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export interface ToolResolution {
  toolName: string
  input: Record<string, unknown>
  confidence: number
  reason: string
  steps?: ToolResolutionStep[]
}
```

### ToolResolutionStep

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export interface ToolResolutionStep {
  toolName: string
  input: Record<string, unknown>
  confidence: number
  reason: string
}
```

### ToolResolutionValidationError

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/resolution-validation.ts).

A resolver returned a resolution that does not match the offered tools or the resolution contract.

```ts
declare class ToolResolutionValidationError extends Error {
  constructor(message: string)
}
```

### ToolResolutionValidationOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/resolution-validation.ts).

```ts
export interface ToolResolutionValidationOptions {
  messageStyle?: 'provider' | 'server'
  singleStep?: boolean
  purpose?: ResolverRunOptions['purpose']
}
```

### ToolResolutionValidationTool

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/resolution-validation.ts).

```ts
export interface ToolResolutionValidationTool {
  name?: string
  inputSchema?: JsonSchema
}
```

### ToolResolver

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export interface ToolResolver {
  capabilities?: { conversation: boolean }
  /** Resolve the selected model's limits; undefined means its capacity is unknown. */
  getModelLimits?: (signal?: AbortSignal) => Promise<ResolverModelLimits | undefined>
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
```

### ToolScopeResult

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export interface ToolScopeResult {
  available: boolean
  reason?: string
}
```

### WebMCPKitEvent

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

```ts
export interface WebMCPKitEvent {
  type:
    | 'registered'
    | 'unregistered'
    | 'invoked'
    | 'confirmation-requested'
    | 'confirmation-settled'
    | 'succeeded'
    | 'failed'
    | 'blocked'
  toolName: string
  timestamp: number
  detail?: unknown
}
```

### WebMCPTool

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/tool.ts).

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
  parseInput?(input: unknown): TInput | Promise<TInput>
  guard?(input: TInput): boolean | string | Promise<boolean | string>
  execute(input: TInput, context: ToolContext): Promise<TOutput> | TOutput
}
```

### arrayParam

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/schema-builders.ts).

```ts
declare function arrayParam<const TItems extends JsonSchema>(
  items: TItems,
  options?: ArrayParamOptions
): { description?: string; maxItems?: number; minItems?: number; type: 'array'; items: TItems }
```

### assertWebMCPIntegration

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/diagnostics.ts).

```ts
declare function assertWebMCPIntegration(
  options?: IntegrationHealthOptions
): IntegrationHealthReport
```

### booleanParam

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/schema-builders.ts).

```ts
declare function booleanParam(description?: string): {
  description?: string | undefined
  type: 'boolean'
}
```

### createResolver

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/resolver.ts).

```ts
declare function createResolver(config?: ResolverProviderConfig): Promise<ToolResolver>
```

### createToolCatalog

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/adapters/catalog.ts).

```ts
declare function createToolCatalog(
  registrations: CatalogRegistration[],
  options?: ToolCatalogOptions
): ToolCatalog
```

### defineServerTool

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/server-tool.ts).

```ts
declare function defineServerTool<const TSchema extends JsonSchema, TOutput = unknown>(
  options: SchemaTypedServerToolOptions<TSchema, TOutput>
): WebMCPTool<InferToolInput<TSchema>, TOutput>
declare function defineServerTool<TInput = Record<string, unknown>, TOutput = unknown>(
  options: DefineServerToolOptions<TInput, TOutput>
): WebMCPTool<TInput, TOutput>
```

### defineTool

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/define-tool.ts).

```ts
declare function defineTool<const TSchema extends JsonSchema, TOutput = unknown>(
  tool: SchemaTypedWebMCPTool<TSchema, TOutput>
): WebMCPTool<InferToolInput<TSchema>, TOutput>
declare function defineTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: Omit<WebMCPTool<NoInfer<TInput>, TOutput>, 'execute' | 'guard'> & {
    execute: (
      input: NoInfer<TInput>,
      context: import('./interfaces/tool').ToolContext
    ) => TOutput | Promise<TOutput>
    guard?: (input: NoInfer<TInput>) => boolean | string | Promise<boolean | string>
  }
): WebMCPTool<TInput, TOutput>
```

### enumParam

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/schema-builders.ts).

```ts
declare function enumParam<const TValue extends string | number | boolean>(
  values: readonly TValue[],
  description?: string
): {
  description?: string | undefined
  enum: TValue[]
  type?: string | readonly string[] | undefined
}
```

### formatJsonValueValidationError

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/schema.ts).

```ts
declare function formatJsonValueValidationError(
  errors: string[],
  subject?: 'input' | 'output'
): string
```

### formatOpenAITool

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/adapters/openai.ts).

```ts
declare function formatOpenAITool(tool: WebMCPTool): OpenAIFunctionTool
```

### formatOpenAITools

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/adapters/openai.ts).

```ts
declare function formatOpenAITools(tools: readonly WebMCPTool[]): OpenAIFunctionTool[]
```

### formatToolCatalogMarkdown

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/adapters/catalog.ts).

```ts
declare function formatToolCatalogMarkdown(catalog: ToolCatalog): string
```

### getErrorMessage

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/confirmation.ts).

```ts
declare function getErrorMessage(error: unknown): string
```

### getIntegrationHealthReport

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/diagnostics.ts).

```ts
declare function getIntegrationHealthReport(
  options?: IntegrationHealthOptions
): IntegrationHealthReport
```

### getRegistrySnapshot

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/registry.ts).

```ts
declare function getRegistrySnapshot(): RegistrySnapshot
```

### getSupportLabel

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/support.ts).

```ts
declare function getSupportLabel(): string
```

### getTool

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/registry.ts).

```ts
declare function getTool(name: string): RegisteredTool | undefined
```

### inferFormInputSchema

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/forms.ts).

```ts
declare function inferFormInputSchema(form: HTMLFormElement): JsonSchema
```

### integerParam

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/schema-builders.ts).

```ts
declare function integerParam(options?: NumberParamOptions): {
  description?: string
  maximum?: number
  minimum?: number
  type: 'integer'
}
```

### invokeTool

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/registry.ts).

```ts
declare function invokeTool<TOutput = unknown>(
  invocation: ToolInvocation
): Promise<ToolInvocationResult<TOutput>>
```

### isResolverError

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/resolver-error.ts).

```ts
declare function isResolverError(value: unknown): value is ResolverError
```

### isResolverOutcomeToolName

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/resolution-validation.ts).

```ts
declare function isResolverOutcomeToolName(toolName: string): toolName is ResolverOutcomeToolName
```

### isWebMCPSupported

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/support.ts).

```ts
declare function isWebMCPSupported(): boolean
```

### listLmStudioModels

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/lm-studio-models.ts).

Lists LM Studio chat models without sending application credentials.

```ts
declare function listLmStudioModels(
  serverUrl?: string,
  signal?: AbortSignal
): Promise<LmStudioModelOption[]>
```

### listTools

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/registry.ts).

```ts
declare function listTools(): RegisteredTool[]
```

### normalizeJsonText

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/resolver.ts).

```ts
declare function normalizeJsonText(value: string, source?: string): string
```

### numberParam

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/schema-builders.ts).

```ts
declare function numberParam(options?: NumberParamOptions): {
  description?: string
  maximum?: number
  minimum?: number
  type: 'number'
}
```

### objectInputSchema

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/schema-builders.ts).

```ts
declare function objectInputSchema<
  const TProperties extends Record<string, JsonSchema>,
  const TRequired extends readonly (keyof TProperties & string)[]
>(
  properties: TProperties,
  options: ObjectInputSchemaOptions<TRequired> & { required: TRequired }
): {
  type: 'object'
  properties: TProperties
  required: TRequired
  additionalProperties: boolean | JsonSchema
}
declare function objectInputSchema<const TProperties extends Record<string, JsonSchema>>(
  properties: TProperties,
  options?: ObjectInputSchemaOptions<readonly (keyof TProperties & string)[]>
): {
  type: 'object'
  properties: TProperties
  required?: readonly (keyof TProperties & string)[]
  additionalProperties: boolean | JsonSchema
}
```

### registerFormTool

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/forms.ts).

```ts
declare function registerFormTool<TOutput = FormData>(
  options: RegisterFormToolOptions<TOutput>
): RegisteredTool<FormInput, TOutput>
```

### registerTool

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/registry.ts).

```ts
declare function registerTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>
): RegisteredTool<TInput, TOutput>
```

### registerTools

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/registry.ts).

Registers every tool or none; one disposer unregisters the whole set.

```ts
declare function registerTools(tools: readonly WebMCPTool[]): RegisteredTools
```

### resolverOutcomeToolNames

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/resolution-validation.ts).

```ts
declare const resolverOutcomeToolNames: readonly ['needs_clarification', 'no_tools_match']
```

### setConfirmationHandler

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/confirmation.ts).

```ts
declare function setConfirmationHandler(handler: ConfirmationHandler | undefined): () => void
```

### stringParam

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/schema-builders.ts).

```ts
declare function stringParam(options?: StringParamOptions): {
  description?: string
  maxLength?: number
  minLength?: number
  pattern?: string
  type: 'string'
}
```

### subscribeWebMCPKitEvents

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/events.ts).

```ts
declare function subscribeWebMCPKitEvents(listener: Listener): () => void
```

### toolResolutionSchema

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/resolution-validation.ts).

```ts
declare const toolResolutionSchema: {
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

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/registry.ts).

```ts
declare function unregisterTool(name: string): boolean
```

### validateJsonSchema

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/schema.ts).

```ts
declare function validateJsonSchema(schema: JsonSchema, path?: string): string[]
```

### validateJsonValue

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/schema.ts).

```ts
declare function validateJsonValue(value: unknown, schema: JsonSchema, path?: string): string[]
```

### validateToolResolution

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/resolution-validation.ts).

```ts
declare function validateToolResolution(
  resolution: unknown,
  tools: ToolResolutionValidationTool[],
  options?: ToolResolutionValidationOptions
): void
```

## @vampaz/webmcp-kit/devtools

### DevtoolsOverlay

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/devtools/src/devtools.ts).

```ts
export interface DevtoolsOverlay {
  refresh: () => void
  destroy: () => void
}
```

### MountDevtoolsOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/devtools/src/devtools.ts).

The overlay renders in its own shadow root. Set `--wmk-devtools-accent` on any ancestor
(for example `:root`) to change its accent colour.

```ts
export interface MountDevtoolsOptions {
  container?: HTMLElement
  initiallyOpen?: boolean
  placement?: 'fixed' | 'inline'
  /** Corner for fixed placement, in logical (writing-direction aware) terms. Default `bottom-end`. */
  position?: 'bottom-end' | 'bottom-start' | 'top-end' | 'top-start'
}
```

### mountDevtoolsOverlay

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/devtools/src/devtools.ts).

```ts
declare function mountDevtoolsOverlay(options?: MountDevtoolsOptions): DevtoolsOverlay
```

## @vampaz/webmcp-kit/mcp-bridge

### MCPBridge

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/mcp-bridge/src/index.ts).

```ts
export interface MCPBridge {
  listTools: () => MCPBridgeTool[]
  callTool: (name: string, input: Record<string, unknown>) => Promise<ToolInvocationResult>
  handleRequest: (request: MCPBridgeRequest) => Promise<MCPBridgeResponse>
}
```

### MCPBridgeRequest

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/mcp-bridge/src/index.ts).

```ts
export interface MCPBridgeRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: 'tools/list' | 'tools/call'
  params?: Record<string, unknown>
}
```

### MCPBridgeResponse

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/mcp-bridge/src/index.ts).

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

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/mcp-bridge/src/index.ts).

```ts
export interface MCPBridgeTool {
  name: string
  description: string
  inputSchema: JsonSchema
  outputSchema?: JsonSchema
  annotations?: ToolAnnotations
}
```

### createLocalMCPBridge

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/mcp-bridge/src/index.ts).

```ts
declare function createLocalMCPBridge(): MCPBridge
```

## @vampaz/webmcp-kit/react

### UseWebMCPToolOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/react/src/interfaces/webmcp-tool.ts).

```ts
export interface UseWebMCPToolOptions {
  when?: boolean
}
```

### UseWebMCPToolResult

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/react/src/interfaces/webmcp-tool.ts).

```ts
export interface UseWebMCPToolResult<TInput = Record<string, unknown>, TOutput = unknown> {
  unregister: () => void
  getRegistration: () => RegisteredTool<TInput, TOutput> | undefined
}
```

### UseWebMCPToolsResult

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/react/src/interfaces/webmcp-tool.ts).

```ts
export interface UseWebMCPToolsResult {
  unregister: () => void
  getRegistrations: () => RegisteredTool[]
}
```

### useWebMCPTool

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/react/src/index.ts).

```ts
declare function useWebMCPTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>,
  options?: UseWebMCPToolOptions
): UseWebMCPToolResult<TInput, TOutput>
```

### useWebMCPTools

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/react/src/index.ts).

Registers the tools as one atomic set with the same stability rules as `useWebMCPTool`.

```ts
declare function useWebMCPTools(
  tools: readonly WebMCPTool[],
  options?: UseWebMCPToolOptions
): UseWebMCPToolsResult
```

## @vampaz/webmcp-kit/svelte

### UseWebMCPToolOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/svelte/src/interfaces/webmcp-tool.ts).

```ts
export interface UseWebMCPToolOptions {
  when?: boolean | Readable<boolean>
}
```

### UseWebMCPToolResult

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/svelte/src/interfaces/webmcp-tool.ts).

```ts
export interface UseWebMCPToolResult<TInput = Record<string, unknown>, TOutput = unknown> {
  unregister: () => void
  getRegistration: () => RegisteredTool<TInput, TOutput> | undefined
}
```

### UseWebMCPToolsResult

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/svelte/src/interfaces/webmcp-tool.ts).

```ts
export interface UseWebMCPToolsResult {
  unregister: () => void
  getRegistrations: () => RegisteredTool[]
}
```

### useWebMCPTool

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/svelte/src/index.ts).

```ts
declare function useWebMCPTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>,
  options?: UseWebMCPToolOptions
): UseWebMCPToolResult<TInput, TOutput>
```

### useWebMCPTools

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/svelte/src/index.ts).

Registers the tools as one atomic set while the component is mounted.

```ts
declare function useWebMCPTools(
  tools: readonly WebMCPTool[],
  options?: UseWebMCPToolOptions
): UseWebMCPToolsResult
```

## @vampaz/webmcp-kit/testing

### TestBridgeSnapshot

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/test-bridge.ts).

```ts
export interface TestBridgeSnapshot extends Omit<RegistrySnapshot, 'tools'> {
  tools: TestBridgeTool[]
}
```

### TestBridgeTool

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/test-bridge.ts).

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

### WebMCPKitTestBridge

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/test-bridge.ts).

```ts
export interface WebMCPKitTestBridge {
  getRegistrySnapshot: () => TestBridgeSnapshot
  listTools: () => TestBridgeTool[]
  invokeTool: <TOutput = unknown>(
    invocation: ToolInvocation
  ) => Promise<ToolInvocationResult<TOutput>>
}
```

### WebMCPResolverEvalCase

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/interfaces/evals.ts).

```ts
export type WebMCPResolverEvalCase = WebMCPResolverEvalCaseBase &
  (
    | {
        expectedToolName: string
        expectedOutcome?: never
      }
    | {
        expectedToolName?: never
        expectedOutcome: WebMCPResolverOutcome
      }
  )
```

### WebMCPResolverEvalCaseBase

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/interfaces/evals.ts).

```ts
export interface WebMCPResolverEvalCaseBase {
  name: string
  message: string
  context?: ResolverContext
  expectedInput?: Record<string, unknown>
  expectedInputSubset?: Record<string, unknown>
  expectedSteps?: WebMCPResolverEvalStepExpectation[]
}
```

### WebMCPResolverEvalCaseSummary

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/interfaces/evals.ts).

```ts
export interface WebMCPResolverEvalCaseSummary {
  name: string
  runs: number
  passes: number
  passRate: number
  passed: boolean
  averageDurationMs: number
  results: WebMCPResolverEvalResult[]
}
```

### WebMCPResolverEvalResult

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/interfaces/evals.ts).

```ts
export interface WebMCPResolverEvalResult {
  name: string
  passed: boolean
  message: string
  durationMs: number
  resolution?: ToolResolution
  errors: string[]
}
```

### WebMCPResolverEvalStepExpectation

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/interfaces/evals.ts).

```ts
export interface WebMCPResolverEvalStepExpectation {
  toolName: string
  inputSubset?: Record<string, unknown>
}
```

### WebMCPResolverEvalSuiteOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/interfaces/evals.ts).

```ts
export interface WebMCPResolverEvalSuiteOptions {
  minimumPassRate?: number
  runsPerCase?: number
}
```

### WebMCPResolverEvalSuiteResult

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/interfaces/evals.ts).

```ts
export interface WebMCPResolverEvalSuiteResult {
  resolverName: string
  passed: boolean
  minimumPassRate: number
  runsPerCase: number
  caseResults: WebMCPResolverEvalCaseSummary[]
}
```

### WebMCPResolverOutcome

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/interfaces/evals.ts).

```ts
export type WebMCPResolverOutcome = 'needs_clarification' | 'no_tools_match'
```

### clearToolsForTest

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/registry.ts).

```ts
declare function clearToolsForTest(): void
```

### getWebMCPRegistrySnapshot

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/playwright.ts).

```ts
declare function getWebMCPRegistrySnapshot(page: WebMCPTestingPage): Promise<TestBridgeSnapshot>
```

### installWebMCPKitTestBridge

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/test-bridge.ts).

```ts
declare function installWebMCPKitTestBridge(target?: Window): () => void
```

### invokeWebMCPTool

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/playwright.ts).

```ts
declare function invokeWebMCPTool<TOutput = unknown>(
  page: WebMCPTestingPage,
  invocation: ToolInvocation
): Promise<ToolInvocationResult<TOutput>>
```

### listWebMCPTools

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/playwright.ts).

```ts
declare function listWebMCPTools(page: WebMCPTestingPage): Promise<TestBridgeTool[]>
```

### runWebMCPResolverEvalCase

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/evals.ts).

```ts
declare function runWebMCPResolverEvalCase(
  resolver: ToolResolver,
  tools: readonly WebMCPTool[],
  testCase: WebMCPResolverEvalCase
): Promise<WebMCPResolverEvalResult>
```

### runWebMCPResolverEvalSuite

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/evals.ts).

```ts
declare function runWebMCPResolverEvalSuite(
  resolver: ToolResolver,
  tools: readonly WebMCPTool[],
  testCases: readonly WebMCPResolverEvalCase[],
  options?: WebMCPResolverEvalSuiteOptions
): Promise<WebMCPResolverEvalSuiteResult>
```

### runWebMCPResolverEvals

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/evals.ts).

```ts
declare function runWebMCPResolverEvals(
  resolver: ToolResolver,
  tools: readonly WebMCPTool[],
  testCases: readonly WebMCPResolverEvalCase[]
): Promise<WebMCPResolverEvalResult[]>
```

### waitForWebMCPTool

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/playwright.ts).

```ts
declare function waitForWebMCPTool(
  page: WebMCPTestingPage,
  toolName: string
): Promise<TestBridgeTool>
```

## @vampaz/webmcp-kit/testing/playwright

### NativeAgentEvaluation

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/interfaces/native-agent.ts).

```ts
export interface NativeAgentEvaluation {
  outcome:
    | 'replied'
    | 'tool_error'
    | 'limit_reached'
    | 'needs_clarification'
    | 'no_tools_match'
    | 'resolver_error'
  reply?: string
  steps: NativeAgentStep[]
  toolCalls: number
  repeatedCalls: number
  catalogBytes: number
  resultBytes: number
  resolverInputBytes: number
  resolverErrors: string[]
}
```

### NativeAgentOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/interfaces/native-agent.ts).

```ts
export interface NativeAgentOptions {
  resolver: ToolResolver
  message: string
  maxToolCalls?: number
}
```

### NativeAgentStep

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/interfaces/native-agent.ts).

```ts
export interface NativeAgentStep {
  toolName: string
  input: Record<string, unknown>
  result: unknown
}
```

### NativeAgentTool

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/interfaces/native-agent.ts).

```ts
export interface NativeAgentTool {
  name: string
  description: string
  inputSchema: JsonSchema
  annotations?: ToolAnnotations
  outputSchema?: JsonSchema
}
```

### WebMCPTestingPage

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/playwright.ts).

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

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/playwright.ts).

```ts
declare function getWebMCPRegistrySnapshot(page: WebMCPTestingPage): Promise<TestBridgeSnapshot>
```

### invokeWebMCPTool

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/playwright.ts).

```ts
declare function invokeWebMCPTool<TOutput = unknown>(
  page: WebMCPTestingPage,
  invocation: ToolInvocation
): Promise<ToolInvocationResult<TOutput>>
```

### listWebMCPTools

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/playwright.ts).

```ts
declare function listWebMCPTools(page: WebMCPTestingPage): Promise<TestBridgeTool[]>
```

### runNativeWebMCPAgent

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/native-agent.ts).

Runs through browser discovery and execution only, without the Kit bridge or private page context.

```ts
declare function runNativeWebMCPAgent(
  page: WebMCPTestingPage,
  options: NativeAgentOptions
): Promise<NativeAgentEvaluation>
```

### waitForWebMCPTool

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/testing/src/playwright.ts).

```ts
declare function waitForWebMCPTool(
  page: WebMCPTestingPage,
  toolName: string
): Promise<TestBridgeTool>
```

## @vampaz/webmcp-kit/vue

### UseWebMCPToolOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/vue/src/interfaces/webmcp-tool.ts).

```ts
export interface UseWebMCPToolOptions {
  when?: MaybeRefOrGetter<boolean>
}
```

### UseWebMCPToolResult

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/vue/src/interfaces/webmcp-tool.ts).

```ts
export interface UseWebMCPToolResult<TInput = Record<string, unknown>, TOutput = unknown> {
  unregister: () => void
  getRegistration: () => RegisteredTool<TInput, TOutput> | undefined
}
```

### UseWebMCPToolsResult

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/vue/src/interfaces/webmcp-tool.ts).

```ts
export interface UseWebMCPToolsResult {
  unregister: () => void
  getRegistrations: () => RegisteredTool[]
}
```

### useWebMCPTool

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/vue/src/index.ts).

```ts
declare function useWebMCPTool<TInput = Record<string, unknown>, TOutput = unknown>(
  tool: WebMCPTool<TInput, TOutput>,
  options?: UseWebMCPToolOptions
): UseWebMCPToolResult<TInput, TOutput>
```

### useWebMCPTools

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/vue/src/index.ts).

Registers the tools as one atomic set for the current component or effect scope.

```ts
declare function useWebMCPTools(
  tools: readonly WebMCPTool[],
  options?: UseWebMCPToolOptions
): UseWebMCPToolsResult
```

## @vampaz/webmcp-kit/zod

### DefineZodToolOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/zod/src/interfaces/zod-tool.ts).

```ts
export interface DefineZodToolOptions<TSchema extends z.ZodType, TOutput = unknown> {
  name: string
  description: string
  schema: TSchema
  outputSchema?: JsonSchema
  annotations?: ToolAnnotations
  confirmation?: ToolConfirmation
  /** Raw input examples, as resolvers send them before Zod parsing. */
  examples?: Array<z.input<TSchema>>
  scope?: () => ToolScopeResult
  guard?: (input: z.infer<TSchema>) => boolean | string | Promise<boolean | string>
  execute: (input: z.infer<TSchema>, context: ToolContext) => Promise<TOutput> | TOutput
}
```

### ZodWebMCPTool

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/zod/src/interfaces/zod-tool.ts).

```ts
export type ZodWebMCPTool<TSchema extends z.ZodType, TOutput = unknown> = WebMCPTool<
  z.infer<TSchema>,
  TOutput
>
```

### defineZodTool

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/zod/src/index.ts).

```ts
declare function defineZodTool<TSchema extends z.ZodType, TOutput = unknown>(
  options: DefineZodToolOptions<TSchema, TOutput>
): ZodWebMCPTool<TSchema, TOutput>
```

## @vampaz/webmcp-kit/pi

### PiActivity

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/interfaces/controller.ts).

```ts
export type PiActivity =
  | { kind: 'resolving' }
  | { kind: 'compacting' }
  | { kind: 'tool'; toolName: string; phase: 'approval' | 'running' }
```

### PiController

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/interfaces/controller.ts).

```ts
export interface PiController {
  getSnapshot(): PiSnapshot
  subscribe(listener: (snapshot: PiSnapshot) => void): () => void
  send(text: string): Promise<PiTurnOutcome>
  stop(): Promise<void>
  clear(): Promise<void>
  /** Reloads saved history, for example after another tab finished a turn. */
  refresh(): Promise<void>
  destroy(): Promise<void>
}
```

### PiConversationOwner

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/conversations.ts).

```ts
export type PiConversationOwner = Pick<PiSession, 'namespace' | 'ownerId'>
```

### PiError

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/interfaces/controller.ts).

```ts
export interface PiError {
  code: PiErrorCode
  message: string
  /** Narrows codes such as `limit_reached` and `storage_failed` to a specific remedy. */
  reason?: PiErrorReason
  /** True when an application action was invoked during the failed turn and may have run. */
  actionMayHaveRun?: boolean
}
```

### PiErrorCode

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/interfaces/controller.ts).

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
```

### PiErrorReason

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/interfaces/controller.ts).

```ts
export type PiErrorReason =
  | 'tool_calls'
  | 'no_progress'
  | 'request_bytes'
  | 'history_bytes'
  | 'tool_result_bytes'
  | 'storage_quota'
  | 'context_overflow'
  | 'timeout'
```

### PiFailure

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/errors.ts).

```ts
declare class PiFailure extends Error {
  readonly reason?: PiErrorReason
  readonly actionMayHaveRun?: boolean
  readonly code: PiErrorCode
  constructor(
    code: PiErrorCode,
    message: string,
    details?: { reason?: PiErrorReason; actionMayHaveRun?: boolean }
  )
}
```

### PiHarnessOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/interfaces/controller.ts).

```ts
export interface PiHarnessOptions {
  session: PiSession
  resolver: ToolResolver
  context?: () => ResolverContext | Promise<ResolverContext>
  host?: PiToolHost
  limits?: PiLimits
  /** Called when pending application approval UI must close. */
  onCancel?: () => void
}
```

### PiHistoryUsage

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/interfaces/controller.ts).

```ts
export interface PiHistoryUsage {
  historyBytes: number
  maxHistoryBytes: number
}
```

### PiLimits

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/interfaces/session.ts).

```ts
export interface PiLimits {
  /** 1–50; default 12. */
  maxToolCalls?: number
  /** UTF-8 bytes in the durable commit log; default 8 MiB. */
  maxHistoryBytes?: number
  /** UTF-8 bytes per resolver request; default four bytes per model context token, or 128 KiB if unknown. */
  maxRequestBytes?: number
  /** Milliseconds per resolver request; 1,000–600,000, default 120,000. */
  requestTimeoutMs?: number
  /** Override the resolver's actual context window; unknown capacity does not trigger proactive summaries. */
  contextTokens?: number
  /** Characters per user message; 1–100,000, default 16,000. */
  maxMessageChars?: number
}
```

### PiMessage

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/interfaces/controller.ts).

```ts
export interface PiMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  text: string
  toolName?: string
  failed?: boolean
  /** Tool messages: the validated input the model chose. */
  input?: Record<string, unknown>
  /** Tool messages: `unknown` when an interruption hid whether the action ran. */
  status?: PiToolStatus
  /** Tool messages: application output, or a structured failure when partial-result details exist. */
  output?: unknown
}
```

### PiRuntimeOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/interfaces/controller.ts).

```ts
export interface PiRuntimeOptions {
  session: PiSession
  resolver: ToolResolver
  host: PiToolHost
  limits?: PiLimits
}
```

### PiSession

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/interfaces/session.ts).

```ts
export interface PiSession {
  namespace: string
  ownerId: string
  conversationId: string
}
```

### PiSnapshot

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/interfaces/controller.ts).

```ts
export interface PiSnapshot {
  state: PiState
  messages: readonly PiMessage[]
  error?: PiError
  /** What a running turn is doing now; absent outside `running` and `stopping`. */
  activity?: PiActivity
  /** Durable log size, so a UI can warn before the history limit. */
  usage?: PiHistoryUsage
}
```

### PiState

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/interfaces/controller.ts).

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

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/interfaces/host.ts).

```ts
export interface PiToolCatalog {
  revision: string
  tools: PiToolDescription[]
}
```

### PiToolDescription

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/interfaces/host.ts).

```ts
export interface PiToolDescription {
  name: string
  description: string
  inputSchema: JsonSchema
  outputSchema?: JsonSchema
  annotations?: ToolAnnotations
}
```

### PiToolHost

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/interfaces/host.ts).

```ts
export interface PiToolHost {
  discover(signal: AbortSignal): Promise<PiToolCatalog>
  context(signal: AbortSignal): Promise<ResolverContext>
  invoke(
    call: { name: string; input: Record<string, unknown>; revision: string },
    signal: AbortSignal,
    /** Optional progress for UI activity; hosts without approval phases may ignore it. */
    progress?: (phase: PiToolPhase) => void
  ): Promise<ToolInvocationResult>
}
```

### PiToolPhase

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/interfaces/host.ts).

```ts
export type PiToolPhase = 'approval' | 'running'
```

### PiToolStatus

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/interfaces/controller.ts).

```ts
export type PiToolStatus = 'success' | 'error' | 'blocked' | 'unavailable' | 'unknown'
```

### PiTurnOutcome

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/interfaces/controller.ts).

```ts
export interface PiTurnOutcome {
  status: 'completed' | 'interrupted' | 'error'
  error?: PiError
}
```

### RegistryToolHostOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/interfaces/host.ts).

```ts
export interface RegistryToolHostOptions {
  /** Limits discovery and invocation to tools intended for this agent. */
  include?(tool: WebMCPTool): boolean
}
```

### createPiHarness

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/connection.ts).

```ts
declare function createPiHarness(options: PiHarnessOptions): Promise<PiController>
```

### createPiRuntime

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/runtime.ts).

```ts
declare function createPiRuntime(options: PiRuntimeOptions): Promise<PiController>
```

### createRegistryToolHost

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/tool-host.ts).

```ts
declare function createRegistryToolHost(
  context?: () => ResolverContext | Promise<ResolverContext>,
  options?: RegistryToolHostOptions
): PiToolHost
```

### deletePiConversations

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/conversations.ts).

Deletes every stored conversation for one account partition. Destroy that account's controllers
first; a conversation with an active operation is left in place and reported as busy.

```ts
declare function deletePiConversations(owner: PiConversationOwner): Promise<void>
```

### isPiError

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/errors.ts).

```ts
declare function isPiError(value: unknown): value is PiError
```

### listPiConversations

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/pi/src/conversations.ts).

Lists stored conversation IDs for one account partition, for example before sign-out.

```ts
declare function listPiConversations(owner: PiConversationOwner): Promise<string[]>
```

## @vampaz/webmcp-kit/chat

### WebMCPChatElement

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/chat/src/interfaces/chat.ts).

```ts
export interface WebMCPChatElement extends HTMLElement {
  configure(options: WebMCPChatOptions): void
  get controller(): PiController | undefined
  set controller(controller: PiController)
  open(): void
  close(): void
  toggle(): void
  focusComposer(): void
  setDraft(text: string): void
}
```

### WebMCPChatLabels

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/chat/src/interfaces/chat.ts).

```ts
export interface WebMCPChatLabels {
  user: string
  newChat: string
  settings: string
  closeSettings: string
  /** @deprecated Unused; settings show labeled controls without an introduction. */
  settingsIntro: string
  conversationModel: string
  provider: string
  model: string
  confirmations: string
  confirmationsHint: string
  send: string
  stop: string
  message: string
  conversation: string
  working: string
  thinking: string
  compacting: string
  hint: string
  jumpToLatest: string
  newMessages: string
  closeChat: string
  moveChat: string
  resizeChat: string
  moveInstructions: string
  resizeInstructions: string
  editLastMessage: string
  /** @deprecated Unused; New chat starts immediately without confirmation. */
  confirmClear: string
  /** @deprecated Unused; New chat starts immediately without confirmation. */
  confirmClearAction: string
  /** @deprecated Unused; New chat starts immediately without confirmation. */
  cancel: string
  tool: string
  toolInput: string
  toolOutput: string
  toolResult: string
  responseFailedDetails: string
  responseFailedExplanation: string
  status: WebMCPChatStatusLabels
  openChat(title: string): string
  characterCount(count: number, max: number): string
  tooLong(count: number, max: number): string
  toolFailed(name: string): string
  toolUnknown(name: string): string
  runningTool(name: string): string
  awaitingApproval(name: string): string
  responseFailed(assistantLabel: string): string
}
```

### WebMCPChatOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/chat/src/interfaces/chat.ts).

```ts
export interface WebMCPChatOptions {
  controller: PiController
  mode?: 'inline' | 'popup'
  /** Popup launcher side in the inline direction; defaults to `end`. */
  placement?: 'end' | 'start'
  /** Defaults to `light`; `auto` follows the user's color scheme. */
  theme?: 'auto' | 'light' | 'dark'
  title?: string
  assistantLabel?: string
  placeholder?: string
  emptyState?: string
  suggestedPrompts?: readonly string[]
  disabled?: boolean
  /** Optional provider, model and approval controls. The application owns their behavior. */
  settings?: WebMCPChatSettings
  labels?: Partial<WebMCPChatLabels>
  /** Locale for number formatting in the default labels. */
  locale?: string
  /** Characters per message; defaults to 16,000. */
  maxMessageLength?: number
  /**
   * Renders a user or assistant message body into `target` when its text changes.
   * Return `true` to skip the default plain-text rendering.
   * Message text is untrusted user and model output: sanitize anything inserted as HTML.
   */
  renderMessage?: (message: PiMessage, target: HTMLElement) => boolean | void
}
```

### WebMCPChatSettings

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/chat/src/interfaces/settings.ts).

```ts
export interface WebMCPChatSettings {
  providers: readonly {
    id: string
    label: string
    models: readonly { model: string; label: string }[]
  }[]
  providerId: string
  model?: string
  detail?: string
  error?: string
  /** Disable changes while the application is switching providers or running a turn. */
  disabled?: boolean
  onChange(providerId: string, model?: string): void
  /** Omit when the application does not offer an approval preference. */
  confirmations?: {
    enabled: boolean
    onChange(enabled: boolean): void
  }
}
```

### WebMCPChatStatusLabels

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/chat/src/interfaces/chat.ts).

```ts
export interface WebMCPChatStatusLabels {
  loading: string
  interrupted: string
  error: string
  closed: string
  lastFailed: string
  newChatStarted: string
  startingNewChat: string
}
```

### defineWebMCPChat

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/chat/src/chat.ts).

```ts
declare function defineWebMCPChat(): void
```

## @vampaz/webmcp-kit/command-input

### InitWebMCPOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/init.ts).

```ts
export interface InitWebMCPOptions {
  buttonLabel?: string
  confirmationHandler?: ConfirmationHandler
  context?: ResolverContext | (() => ResolverContext)
  /** Shows the floating panel launcher. Default `true` for an element created by `initWebMCP()`. */
  launcher?: boolean
  placeholder?: string
  resolver?: ToolResolver
  target?: string | WebMCPCommandInputElement
  tools?: readonly WebMCPTool[]
}
```

### WebMCPCommandErrorEventDetail

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/command-input.ts).

```ts
export interface WebMCPCommandErrorEventDetail {
  error: string
  message: string
}
```

### WebMCPCommandInputConfigureOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/command-input.ts).

```ts
export type WebMCPCommandInputConfigureOptions = {
  buttonLabel?: string
  context?: ResolverContext | (() => ResolverContext)
  disabled?: boolean
  floating?: boolean
  initialModel?: string
  initialResolverOptionId?: string
  /** Visible label and accessible name of the command field. Default `Command`. */
  label?: string
  /** Replaces the custom visible strings; omitted keys use the defaults. */
  labels?: Partial<WebMCPCommandInputLabels>
  /** Shows a launcher button that toggles the floating panel. */
  launcher?: boolean
  placeholder?: string
  settingsOpen?: boolean
} & (
  | { resolver?: ToolResolver; resolverOptions?: never }
  | { resolver?: never; resolverOptions?: WebMCPCommandInputResolverOption[] }
)
```

### WebMCPCommandInputElement

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/command-input.ts).

```ts
export interface WebMCPCommandInputElement extends HTMLElement {
  buttonLabel?: string
  context?: ResolverContext | (() => ResolverContext)
  disabled: boolean
  floating: boolean
  label: string
  get labels(): WebMCPCommandInputLabels
  set labels(value: Partial<WebMCPCommandInputLabels> | undefined)
  launcher: boolean
  panelOpen: boolean
  placeholder: string
  resolver?: ToolResolver
  resolverOptions?: WebMCPCommandInputResolverOption[]
  closePanel(): void
  configure(options: WebMCPCommandInputConfigureOptions): void
  openPanel(): void
  /**
   * Failure results use `code: 'cancelled'` after Stop, Escape, or an aborted signal, and
   * `code: 'resolver_failed'` when creating the resolver or resolving the command fails.
   */
  run(
    message?: string,
    options?: WebMCPCommandInputRunOptions
  ): Promise<ToolInvocationResult | undefined>
  togglePanel(): void
}
```

### WebMCPCommandInputLabels

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/command-input.ts).

Visible text used by `<webmcp-command-input>`. Every key has an English default.

```ts
export interface WebMCPCommandInputLabels {
  /** Accessible name of the command form. Default `WebMCP command input`. */
  form: string
  /** Idle text of the submit button. `buttonLabel` overrides it. Default `Run`. */
  run: string
  /** Text of the button while a command runs. Default `Stop`. */
  stop: string
  /** Text of the floating panel launcher. Default `Commands`. */
  launcher: string
  /** Summary of the resolver options disclosure. Default `Options`. */
  options: string
  /** Label of the provider select. Default `Provider`. */
  provider: string
  /** Label of the model select. Default `Model`. */
  model: string
  /** Summary of the slotted diagnostics disclosure. Default `Developer diagnostics`. */
  diagnostics: string
  /** Status before the resolver reports its own detail. Default `Resolver is waiting for a command.` */
  idle: string
  /** Status while the resolver is prepared. Default `Preparing...`. */
  preparing: string
  /** Status while the resolver selects a tool. Default `Resolving...`. */
  resolving: string
  /** Status while a tool runs; `{tool}` is replaced with the tool name. Default `Running {tool}.` */
  executing: string
  /** Status after the user or a signal stops a command. Default `Command was cancelled.` */
  cancelled: string
}
```

### WebMCPCommandInputPhase

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/command-input.ts).

```ts
export type WebMCPCommandInputPhase =
  | 'idle'
  | 'preparing'
  | 'resolving'
  | 'executing'
  | 'completed'
  | 'failed'
```

### WebMCPCommandInputResolverCreateOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/command-input.ts).

```ts
export interface WebMCPCommandInputResolverCreateOptions {
  model?: string
  modelOption?: WebMCPCommandInputResolverModelOption
}
```

### WebMCPCommandInputResolverModelOption

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/command-input.ts).

```ts
export interface WebMCPCommandInputResolverModelOption {
  label: string
  model: string
}
```

### WebMCPCommandInputResolverOption

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/command-input.ts).

```ts
export interface WebMCPCommandInputResolverOption {
  createResolver: (
    options?: WebMCPCommandInputResolverCreateOptions
  ) => Promise<ToolResolver> | ToolResolver
  id: string
  label: string
  modelOptions?: WebMCPCommandInputResolverModelOption[]
}
```

### WebMCPCommandPanelToggleEventDetail

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/command-input.ts).

```ts
export interface WebMCPCommandPanelToggleEventDetail {
  open: boolean
}
```

### WebMCPCommandResolutionEventDetail

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/command-input.ts).

```ts
export interface WebMCPCommandResolutionEventDetail {
  message: string
  resolution: ToolResolution
  resolver: ToolResolver
}
```

### WebMCPCommandResolverEventDetail

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/command-input.ts).

```ts
export interface WebMCPCommandResolverEventDetail {
  resolver: ToolResolver
}
```

### WebMCPCommandResultEventDetail

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/command-input.ts).

```ts
export interface WebMCPCommandResultEventDetail {
  message: string
  resolution: ToolResolution
  result: ToolInvocationResult
}
```

### WebMCPCommandStepEventDetail

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/command-input.ts).

```ts
export interface WebMCPCommandStepEventDetail {
  message: string
  phase: 'started' | 'completed'
  resolution: ToolResolution
  result?: ToolInvocationResult
  step: ToolResolutionStep
  stepCount: number
  stepIndex: number
}
```

### WebMCPInitHandle

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/init.ts).

```ts
export interface WebMCPInitHandle {
  element: WebMCPCommandInputElement
  resolver?: ToolResolver
  registrations: RegisteredTool[]
  destroy: () => void
}
```

### defineWebMCPCommandInput

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/command-input.ts).

```ts
declare function defineWebMCPCommandInput(tagName?: string): CommandInputConstructor
```

### initWebMCP

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/init.ts).

```ts
declare function initWebMCP(options?: InitWebMCPOptions): WebMCPInitHandle
```

## @vampaz/webmcp-kit/hosted

### HostedOpenAIResolverOptionConfig

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/hosted-openai-resolver.ts).

```ts
export interface HostedOpenAIResolverOptionConfig {
  accessKey?: string
  baseUrl?: string
  browserChallengeSiteKey?: string
  endpoint?: string
  id?: string
  label?: string
  model?: string
  modelOptions?: WebMCPCommandInputResolverModelOption[]
  sessionEndpoint?: string
}
```

### HostedOpenAIResolverOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/hosted-openai-resolver.ts).

```ts
export interface HostedOpenAIResolverOptions {
  accessKey?: string
  baseUrl?: string
  browserChallengeSiteKey?: string
  endpoint?: string
  model: string
  modelLimits?: ResolverModelLimits
  sessionEndpoint?: string
}
```

### createHostedOpenAIResolver

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/hosted-openai-resolver.ts).

```ts
declare function createHostedOpenAIResolver(rawOptions: HostedOpenAIResolverOptions): ToolResolver
```

### createHostedOpenAIResolverOption

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/hosted-openai-resolver.ts).

```ts
declare function createHostedOpenAIResolverOption(
  config: HostedOpenAIResolverOptionConfig
): WebMCPCommandInputResolverOption
```

## Supporting types

These types are referenced by exported contracts. Use the owning public type to access them; do not import internal source paths.

### UnknownToRecord

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/schema-inference.ts).

```ts
type UnknownToRecord<T> = [unknown] extends [T] ? Record<string, unknown> : T
```

### InferJsonSchemaType

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/schema-inference.ts).

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

### CatalogRegistration

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/adapters/catalog.ts).

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

### Listener

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/events.ts).

```ts
type Listener = (event: WebMCPKitEvent) => void
```

### WebMCPCommandInputRunOptions

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/command-input.ts).

```ts
export interface WebMCPCommandInputRunOptions {
  signal?: AbortSignal
}
```

### CommandInputConstructor

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/command-input.ts).

```ts
type CommandInputConstructor = CustomElementConstructor & {
  observedAttributes: string[]
}
```

### InferNamedType

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/schema-inference.ts).

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

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/schema-inference.ts).

```ts
type InferArrayType<S> = S extends { items: infer I } ? InferJsonSchemaType<I>[] : unknown[]
```

### InferObjectType

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/schema-inference.ts).

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

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/schema-inference.ts).

```ts
type Simplify<T> = { [K in keyof T]: T[K] } & {}
```

### RequiredPropertyKeys

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/schema-inference.ts).

```ts
type RequiredPropertyKeys<S, P> = S extends { required: readonly (infer R)[] }
  ? Extract<keyof P, R>
  : never
```

### OptionalPropertyKeys

[Source in the repository](https://github.com/vampaz/web-mcp/blob/master/packages/core/src/interfaces/schema-inference.ts).

```ts
type OptionalPropertyKeys<S, P> = Exclude<keyof P, RequiredPropertyKeys<S, P>>
```
