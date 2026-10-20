export { defineTool, type SchemaTypedWebMCPTool } from './define-tool'
export type { InferToolInput } from './interfaces/schema-inference'
export {
  getErrorMessage,
  setConfirmationHandler,
  type ConfirmationHandler,
  type ConfirmationRequest,
  type ConfirmationTool
} from './confirmation'
export {
  createToolCatalog,
  formatToolCatalogMarkdown,
  type ToolCatalog,
  type ToolCatalogEntry,
  type ToolCatalogOptions
} from './adapters/catalog'
export { formatOpenAITool, formatOpenAITools, type OpenAIFunctionTool } from './adapters/openai'
export { subscribeWebMCPKitEvents } from './events'
export {
  assertWebMCPIntegration,
  getIntegrationHealthReport,
  type IntegrationHealthOptions
} from './diagnostics'
export {
  inferFormInputSchema,
  registerFormTool,
  type FormInput,
  type RegisterFormToolFieldOptions,
  type RegisterFormToolOptions
} from './forms'
export type {
  IntegrationDiagnostic,
  IntegrationHealthReport,
  JsonSchema,
  ResolverContext,
  ResolverAuth,
  ResolverProviderConfig,
  RemoteResolverConfig,
  ResolverProviderKind,
  ResolverRequest,
  ResolverRunOptions,
  RegisteredTool,
  RegistrySnapshot,
  ToolConfirmation,
  ToolAnnotations,
  ToolContext,
  ToolInvocation,
  ToolInvocationErrorCode,
  ToolInvocationResult,
  ToolResolution,
  ToolResolutionStep,
  ToolResolver,
  ToolScopeResult,
  WebMCPKitEvent,
  WebMCPTool
} from './interfaces/tool'
export { createResolver, normalizeJsonText } from './resolver'
export {
  isResolverOutcomeToolName,
  resolverOutcomeToolNames,
  toolResolutionSchema,
  validateToolResolution,
  type ResolverOutcomeToolName,
  type ToolResolutionValidationOptions,
  type ToolResolutionValidationTool
} from './resolution-validation'
export {
  getRegistrySnapshot,
  getTool,
  invokeTool,
  listTools,
  registerTool,
  unregisterTool
} from './registry'
export { formatJsonValueValidationError, validateJsonSchema, validateJsonValue } from './schema'
export {
  arrayParam,
  booleanParam,
  enumParam,
  integerParam,
  numberParam,
  objectInputSchema,
  stringParam,
  type ArrayParamOptions,
  type NumberParamOptions,
  type ObjectInputSchemaOptions,
  type StringParamOptions
} from './schema-builders'
export { defineServerTool, type DefineServerToolOptions, type ServerToolFetch } from './server-tool'
export { getSupportLabel, isWebMCPSupported } from './support'
