import type { PlannerProviderConfig, PlannerProviderKind, ToolPlanner } from './interfaces/tool'
import { createBestPlanner, createChromeAIPlanner, createConfiguredPlanner, createHeuristicPlanner } from './planner'
import { escapeAttribute, escapeHtml } from './command-input-html'

type ModelOption = {
  label: string
  value: string
}

export const defaultModel = 'openrouter/auto'
export const defaultEndpoint = '/api/webmcp/plan'

export async function createCommandInputPlanner(config: PlannerProviderConfig | undefined): Promise<ToolPlanner> {
  if (!config) return createBestPlanner()
  if (config.provider === 'chrome-built-in') return createChromeAIPlanner(false)
  if (config.provider === 'local') return createHeuristicPlanner()

  return createConfiguredPlanner(config)
}

export function getProviderControlMarkup(provider: PlannerProviderKind): string {
  return `
    <label>
      <span>Provider</span>
      <select data-provider>
        ${getProviderOptionsMarkup(provider)}
      </select>
    </label>
  `
}

export function getOptionsStatusText(provider: PlannerProviderKind, model: string): string {
  if (provider === 'auto') return 'Auto'
  if (!usesModelInput(provider)) return getProviderLabel(provider)
  return `${getProviderLabel(provider)} · ${getModelLabel(provider, model)}`
}

export function getModelControlMarkup(provider: PlannerProviderKind, model: string): string {
  const options = getModelOptions(provider)
  if (options.length === 0) {
    return `
      <label>
        <span>Model</span>
        <input data-model value="${escapeAttribute(model)}" placeholder="provider/model" />
      </label>
    `
  }

  return `
    <label>
      <span>Model</span>
      <select data-model>
        ${getModelOptionsMarkup(options, model)}
      </select>
    </label>
  `
}

export function getDefaultModelForProvider(provider: PlannerProviderKind): string {
  if (provider === 'openai') return 'gpt-5.4-mini'
  if (provider === 'cloudflare-binding') return '@cf/zai-org/glm-4.7-flash'
  if (provider === 'cloudflare-workers-ai') return '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b'
  if (provider === 'openai-compatible') return ''
  if (provider === 'openrouter') return 'openrouter/auto'
  return defaultModel
}

export function usesModelInput(provider: PlannerProviderKind): boolean {
  return provider === 'openai'
    || provider === 'openrouter'
    || provider === 'openai-compatible'
    || provider === 'cloudflare-binding'
    || provider === 'cloudflare-workers-ai'
}

export function isPlannerAttribute(name: string): boolean {
  return name === 'account-id'
    || name === 'api-key'
    || name === 'auth-mode'
    || name === 'base-url'
    || name === 'endpoint'
    || name === 'model'
    || name === 'provider'
}

export function isAuthMode(value: unknown): value is 'none' | 'server' | 'user-key' {
  return value === 'none' || value === 'server' || value === 'user-key'
}

export function isPlannerProviderKind(value: unknown): value is PlannerProviderKind {
  return value === 'auto'
    || value === 'chrome-built-in'
    || value === 'local'
    || value === 'openai'
    || value === 'openrouter'
    || value === 'openai-compatible'
    || value === 'cloudflare-binding'
    || value === 'cloudflare-workers-ai'
}

function getProviderOptionsMarkup(provider: PlannerProviderKind): string {
  return getProviderOptions().map(function mapProviderOption(option) {
    return `<option value="${escapeAttribute(option.value)}" ${option.value === provider ? 'selected' : ''}>${escapeHtml(option.label)}</option>`
  }).join('')
}

function getProviderOptions(): Array<{ label: string, value: PlannerProviderKind }> {
  return [
    { label: 'Auto', value: 'auto' },
    { label: 'Chrome built-in AI', value: 'chrome-built-in' },
    { label: 'Local deterministic', value: 'local' },
    { label: 'OpenRouter', value: 'openrouter' },
    { label: 'OpenAI', value: 'openai' },
    { label: 'OpenAI-compatible', value: 'openai-compatible' },
    { label: 'Cloudflare binding', value: 'cloudflare-binding' },
    { label: 'Cloudflare Workers AI', value: 'cloudflare-workers-ai' }
  ]
}

function getProviderLabel(provider: PlannerProviderKind): string {
  const option = getProviderOptions().find(function findProviderOption(item) {
    return item.value === provider
  })
  return option?.label ?? provider
}

function getModelLabel(provider: PlannerProviderKind, model: string): string {
  const option = getModelOptions(provider).find(function findModelOption(item) {
    return item.value === model
  })
  return option?.label ?? model
}

function getModelOptionsMarkup(options: ModelOption[], model: string): string {
  return options.map(function mapModelOption(option) {
    return `<option value="${escapeAttribute(option.value)}" ${option.value === model ? 'selected' : ''}>${escapeHtml(option.label)}</option>`
  }).join('')
}

function getModelOptions(provider: PlannerProviderKind): ModelOption[] {
  if (provider === 'openai') {
    return [
      { label: 'GPT-5.4 mini', value: 'gpt-5.4-mini' }
    ]
  }

  if (provider === 'openrouter') {
    return [
      { label: 'OpenRouter auto', value: 'openrouter/auto' }
    ]
  }

  if (provider === 'cloudflare-binding' || provider === 'cloudflare-workers-ai') {
    return [
      { label: 'GLM 4.7 Flash', value: '@cf/zai-org/glm-4.7-flash' },
      { label: 'GPT OSS 20B', value: '@cf/openai/gpt-oss-20b' },
      { label: 'Kimi K2.6', value: '@cf/moonshotai/kimi-k2.6' },
      { label: 'Qwen3 30B A3B FP8', value: '@cf/qwen/qwen3-30b-a3b-fp8' },
      { label: 'DeepSeek R1 Distill Qwen 32B', value: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b' },
      { label: 'Qwen QwQ 32B', value: '@cf/qwen/qwq-32b' },
      { label: 'Nemotron 3 120B A12B', value: '@cf/nvidia/nemotron-3-120b-a12b' },
      { label: 'Gemma 4 26B A4B', value: '@cf/google/gemma-4-26b-a4b-it' }
    ]
  }

  return []
}
