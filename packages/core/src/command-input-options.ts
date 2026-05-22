import type { PlannerProviderConfig, PlannerProviderKind, ToolPlanner } from './interfaces/tool'
import type { WebMCPCommandInputEndpointOption } from './interfaces/command-input'
import {
  createBestPlanner,
  createChromeAIPlanner,
  createConfiguredPlanner,
  createHeuristicPlanner
} from './planner'
import { escapeAttribute } from './command-input-html'

type ModelOption = {
  label: string
  value: string
}

type ProviderOption = {
  label: string
  value: PlannerProviderKind
}

export const defaultModel = ''
export const defaultEndpoint = '/api/webmcp/plan'

export async function createCommandInputPlanner(
  config: PlannerProviderConfig | undefined
): Promise<ToolPlanner> {
  if (!config) return createBestPlanner()
  if (config.provider === 'chrome-built-in') return createChromeAIPlanner(false)
  if (config.provider === 'local') return createHeuristicPlanner()

  return createConfiguredPlanner(config)
}

export function getProviderControlMarkup(
  provider: PlannerProviderKind,
  endpointOptions?: WebMCPCommandInputEndpointOption[],
  includeChromeAI = false
): string {
  return `
    <label>
      <span>Provider</span>
      <select data-provider>
        ${getProviderOptionsMarkup(provider, endpointOptions, includeChromeAI)}
      </select>
    </label>
  `
}

export function getOptionsStatusText(
  provider: PlannerProviderKind,
  model: string,
  endpointOptions?: WebMCPCommandInputEndpointOption[]
): string {
  if (provider === 'auto') return 'Auto'
  const modelLabel = getModelLabel(provider, model, endpointOptions)
  if (!modelLabel) return getProviderLabel(provider)
  return `${getProviderLabel(provider)} · ${modelLabel}`
}

export function getModelControlMarkup(
  provider: PlannerProviderKind,
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

export function getDefaultModelForProvider(
  provider: PlannerProviderKind,
  endpointOptions?: WebMCPCommandInputEndpointOption[]
): string {
  const configuredOption = getConfiguredEndpointOptions(provider, endpointOptions)[0]
  if (configuredOption) return configuredOption.value
  return ''
}

export function getDefaultProvider(
  endpointOptions?: WebMCPCommandInputEndpointOption[],
  includeChromeAI = false
): PlannerProviderKind {
  if (includeChromeAI) return 'chrome-built-in'
  return endpointOptions?.[0]?.provider ?? 'auto'
}

export function getModelOptionCount(
  provider: PlannerProviderKind,
  endpointOptions?: WebMCPCommandInputEndpointOption[]
): number {
  return getConfiguredEndpointOptions(provider, endpointOptions).length
}

export function getProviderOptionCount(
  endpointOptions?: WebMCPCommandInputEndpointOption[],
  includeChromeAI = false
): number {
  return getConfiguredProviderOptions(endpointOptions, includeChromeAI).length
}

export function isPlannerAttribute(name: string): boolean {
  return (
    name === 'account-id' ||
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

export function isPlannerProviderKind(value: unknown): value is PlannerProviderKind {
  return (
    value === 'auto' ||
    value === 'chrome-built-in' ||
    value === 'local' ||
    value === 'openai' ||
    value === 'openrouter' ||
    value === 'openai-compatible' ||
    value === 'cloudflare-binding' ||
    value === 'cloudflare-workers-ai'
  )
}

function getProviderOptionsMarkup(
  provider: PlannerProviderKind,
  endpointOptions?: WebMCPCommandInputEndpointOption[],
  includeChromeAI = false
): string {
  return getConfiguredProviderOptions(endpointOptions, includeChromeAI)
    .map(function mapProviderOption(option) {
      return `<option value="${escapeAttribute(option.value)}" ${option.value === provider ? 'selected' : ''}>${escapeAttribute(option.label)}</option>`
    })
    .join('')
}

function getProviderLabel(provider: PlannerProviderKind): string {
  if (provider === 'auto') return 'Auto'
  if (provider === 'chrome-built-in') return 'Chrome built-in AI'
  if (provider === 'local') return 'Local deterministic'
  if (provider === 'openrouter') return 'OpenRouter'
  if (provider === 'openai') return 'OpenAI'
  if (provider === 'openai-compatible') return 'OpenAI-compatible'
  if (provider === 'cloudflare-binding') return 'Cloudflare binding'
  if (provider === 'cloudflare-workers-ai') return 'Cloudflare Workers AI'
  return provider
}

function getModelLabel(
  provider: PlannerProviderKind,
  model: string,
  endpointOptions?: WebMCPCommandInputEndpointOption[]
): string | undefined {
  if (!model) return undefined
  const option = getModelOptions(provider, endpointOptions).find(function findModelOption(item) {
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
  provider: PlannerProviderKind,
  endpointOptions?: WebMCPCommandInputEndpointOption[]
): ModelOption[] {
  return getConfiguredEndpointOptions(provider, endpointOptions)
}

function getConfiguredEndpointOptions(
  provider: PlannerProviderKind,
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
  includeChromeAI = false
): ProviderOption[] {
  const providers: ProviderOption[] = []
  if (includeChromeAI) {
    providers.push({
      label: getProviderLabel('chrome-built-in'),
      value: 'chrome-built-in'
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
