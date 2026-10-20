import type { WebMCPCommandInputResolverOption } from './interfaces/command-input'
import { escapeAttribute, escapeHtml } from './command-input-html'

export function getDefaultModelForResolverOption(
  option: WebMCPCommandInputResolverOption | undefined
): string {
  return option?.modelOptions?.[0]?.model ?? ''
}

export function getResolverOptionStatusText(
  option: WebMCPCommandInputResolverOption,
  model: string
): string {
  const label = option.modelOptions?.find(function selected(item) {
    return item.model === model
  })?.label
  return label ? `${option.label} · ${label}` : option.label
}

export function getProviderControlMarkup(
  selected: string,
  options: WebMCPCommandInputResolverOption[]
): string {
  return `<label><span>Provider</span><select data-provider>${options
    .map(function option(item) {
      return `<option value="${escapeAttribute(item.id)}" ${item.id === selected ? 'selected' : ''}>${escapeHtml(item.label)}</option>`
    })
    .join('')}</select></label>`
}

export function getResolverOptionModelControlMarkup(
  option: WebMCPCommandInputResolverOption,
  selected: string
): string {
  return `<label><span>Model</span><select data-model>${(option.modelOptions ?? [])
    .map(function model(item) {
      return `<option value="${escapeAttribute(item.model)}" ${item.model === selected ? 'selected' : ''}>${escapeHtml(item.label)}</option>`
    })
    .join('')}</select></label>`
}
