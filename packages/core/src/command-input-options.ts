import type { ResolverProviderConfig, ResolverProviderKind, ToolResolver } from './interfaces/tool'
import type {
  WebMCPCommandInputEndpointOption,
  WebMCPCommandInputResolverModelOption,
  WebMCPCommandInputResolverOption
} from './interfaces/command-input'
import {
  createBestResolver,
  createChromeAIResolver,
  createConfiguredResolver,
  createHeuristicResolver
} from './resolver'
import { escapeAttribute } from './command-input-html'

type ModelOption = {
  label: string
  value: string
}

type ProviderOption = {
  label: string
  value: string
}

export const defaultModel = ''
export const defaultEndpoint = '/api/webmcp/resolve'
export const resolverOptionValuePrefix = 'resolver:'

export async function createCommandInputResolver(
  config: ResolverProviderConfig | undefined
): Promise<ToolResolver> {
  if (!config) return createBestResolver()
  if (config.provider === 'chrome-built-in') return createChromeAIResolver(true)
  if (config.provider === 'local') return createHeuristicResolver()

  return createConfiguredResolver(config)
}

export function getProviderControlMarkup(
  provider: string,
  endpointOptions?: WebMCPCommandInputEndpointOption[],
  includeChromeAI = false,
  resolverOptions?: WebMCPCommandInputResolverOption[]
): string {
  return `
    <label>
      <span>Provider</span>
      <select data-provider>
        ${getProviderOptionsMarkup(provider, endpointOptions, includeChromeAI, resolverOptions)}
      </select>
    </label>
  `
}

export function getOptionsStatusText(
  provider: ResolverProviderKind,
  model: string,
  endpointOptions?: WebMCPCommandInputEndpointOption[]
): string {
  if (provider === 'auto') return 'Auto'
  const modelLabel = getModelLabel(provider, model, endpointOptions)
  if (!modelLabel) return getProviderLabel(provider)
  return `${getProviderLabel(provider)} · ${modelLabel}`
}

export function getResolverOptionStatusText(
  resolverOption: WebMCPCommandInputResolverOption,
  model: string
): string {
  const modelLabel = getResolverOptionModelLabel(resolverOption, model)
  if (!modelLabel) return resolverOption.label

  return `${resolverOption.label} · ${modelLabel}`
}

export function getModelControlMarkup(
  provider: ResolverProviderKind,
  model: string,
  endpointOptions?: WebMCPCommandInputEndpointOption[]
): string {
  const options = getModelOptions(provider, endpointOptions)

  return `
    <label>
      <span>Model</span>
      <select data-model>
        ${getModelOptionsMarkup(options, model)}
      </select>
    </label>
  `
}

export function getResolverOptionModelControlMarkup(
  resolverOption: WebMCPCommandInputResolverOption,
  model: string
): string {
  return `
    <label>
      <span>Model</span>
      <select data-model>
        ${getModelOptionsMarkup(getResolverOptionModelOptions(resolverOption), model)}
      </select>
    </label>
  `
}

export function getDefaultModelForProvider(
  provider: ResolverProviderKind,
  endpointOptions?: WebMCPCommandInputEndpointOption[]
): string {
  const configuredOption = getConfiguredEndpointOptions(provider, endpointOptions)[0]
  if (configuredOption) return configuredOption.value
  return ''
}

export function getDefaultModelForResolverOption(
  resolverOption: WebMCPCommandInputResolverOption | undefined
): string {
  return getResolverOptionModelOptions(resolverOption)[0]?.value ?? ''
}

export function getDefaultProvider(
  endpointOptions?: WebMCPCommandInputEndpointOption[],
  includeChromeAI = false
): ResolverProviderKind {
  if (includeChromeAI) return 'chrome-built-in'
  return endpointOptions?.[0]?.provider ?? 'auto'
}

export function getModelOptionCount(
  provider: ResolverProviderKind,
  endpointOptions?: WebMCPCommandInputEndpointOption[]
): number {
  return getConfiguredEndpointOptions(provider, endpointOptions).length
}

export function getResolverOptionModelOptionCount(
  resolverOption: WebMCPCommandInputResolverOption | undefined
): number {
  return getResolverOptionModelOptions(resolverOption).length
}

export function getProviderOptionCount(
  endpointOptions?: WebMCPCommandInputEndpointOption[],
  includeChromeAI = false,
  resolverOptions?: WebMCPCommandInputResolverOption[]
): number {
  return getConfiguredProviderOptions(endpointOptions, includeChromeAI, resolverOptions).length
}

export function isResolverAttribute(name: string): boolean {
  return (
    name === 'api-key' ||
    name === 'auth-mode' ||
    name === 'base-url' ||
    name === 'endpoint' ||
    name === 'model' ||
    name === 'provider'
  )
}

export function isAuthMode(value: unknown): value is 'none' | 'server' | 'user-key' {
  return value === 'none' || value === 'server' || value === 'user-key'
}

export function isResolverProviderKind(value: unknown): value is ResolverProviderKind {
  return (
    value === 'auto' ||
    value === 'chrome-built-in' ||
    value === 'local' ||
    value === 'openai' ||
    value === 'openrouter' ||
    value === 'openai-compatible' ||
    value === 'cloudflare-binding'
  )
}

export function getResolverOptionValue(id: string): string {
  return `${resolverOptionValuePrefix}${id}`
}

export function getResolverOptionId(value: string): string | undefined {
  if (!value.startsWith(resolverOptionValuePrefix)) return undefined
  return value.slice(resolverOptionValuePrefix.length) || undefined
}

function getProviderOptionsMarkup(
  provider: string,
  endpointOptions?: WebMCPCommandInputEndpointOption[],
  includeChromeAI = false,
  resolverOptions?: WebMCPCommandInputResolverOption[]
): string {
  return getConfiguredProviderOptions(endpointOptions, includeChromeAI, resolverOptions)
    .map(function mapProviderOption(option) {
      return `<option value="${escapeAttribute(option.value)}" ${option.value === provider ? 'selected' : ''}>${escapeAttribute(option.label)}</option>`
    })
    .join('')
}

function getProviderLabel(provider: ResolverProviderKind): string {
  if (provider === 'auto') return 'Auto'
  if (provider === 'chrome-built-in') return 'Chrome built-in AI'
  if (provider === 'local') return 'Local deterministic'
  if (provider === 'openrouter') return 'OpenRouter'
  if (provider === 'openai') return 'OpenAI'
  if (provider === 'openai-compatible') return 'OpenAI-compatible'
  if (provider === 'cloudflare-binding') return 'Cloudflare binding'
  return provider
}

function getModelLabel(
  provider: ResolverProviderKind,
  model: string,
  endpointOptions?: WebMCPCommandInputEndpointOption[]
): string | undefined {
  if (!model) return undefined
  const option = getModelOptions(provider, endpointOptions).find(function findModelOption(item) {
    return item.value === model
  })
  return option?.label ?? model
}

function getResolverOptionModelLabel(
  resolverOption: WebMCPCommandInputResolverOption,
  model: string
): string | undefined {
  if (!model) return undefined
  const option = getResolverOptionModelOptions(resolverOption).find(function findModelOption(item) {
    return item.value === model
  })
  return option?.label ?? model
}

function getModelOptionsMarkup(options: ModelOption[], model: string): string {
  return options
    .map(function mapModelOption(option) {
      return `<option value="${escapeAttribute(option.value)}" ${option.value === model ? 'selected' : ''}>${escapeAttribute(option.label)}</option>`
    })
    .join('')
}

function getModelOptions(
  provider: ResolverProviderKind,
  endpointOptions?: WebMCPCommandInputEndpointOption[]
): ModelOption[] {
  return getConfiguredEndpointOptions(provider, endpointOptions)
}

function getResolverOptionModelOptions(
  resolverOption: WebMCPCommandInputResolverOption | undefined
): ModelOption[] {
  return (resolverOption?.modelOptions ?? []).map(function mapResolverOptionModel(
    option: WebMCPCommandInputResolverModelOption
  ) {
    return {
      label: option.label,
      value: option.model
    }
  })
}

function getConfiguredEndpointOptions(
  provider: ResolverProviderKind,
  endpointOptions: WebMCPCommandInputEndpointOption[] | undefined
): ModelOption[] {
  return (endpointOptions ?? [])
    .filter(function matchesProvider(option) {
      return option.provider === provider && Boolean(option.model)
    })
    .map(function mapEndpointOption(option) {
      return {
        label: option.label,
        value: option.model ?? ''
      }
    })
}

function getConfiguredProviderOptions(
  endpointOptions: WebMCPCommandInputEndpointOption[] | undefined,
  includeChromeAI = false,
  resolverOptions?: WebMCPCommandInputResolverOption[]
): ProviderOption[] {
  const providers: ProviderOption[] = []
  if (includeChromeAI) {
    providers.push({
      label: getProviderLabel('chrome-built-in'),
      value: 'chrome-built-in'
    })
  }

  for (const option of resolverOptions ?? []) {
    providers.push({
      label: option.label,
      value: getResolverOptionValue(option.id)
    })
  }

  for (const option of endpointOptions ?? []) {
    if (
      providers.some(function hasProvider(provider) {
        return provider.value === option.provider
      })
    )
      continue
    providers.push({
      label: getProviderLabel(option.provider),
      value: option.provider
    })
  }

  return providers
}
