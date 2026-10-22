import type { CommandInputSelectState } from './command-input-render'
import type { WebMCPCommandInputResolverOption } from './interfaces/command-input'

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

export function getProviderSelectState(
  selected: string,
  options: WebMCPCommandInputResolverOption[]
): CommandInputSelectState {
  return {
    options: options.map(function option(item) {
      return { label: item.label, value: item.id }
    }),
    selected
  }
}

export function getModelSelectState(
  option: WebMCPCommandInputResolverOption,
  selected: string
): CommandInputSelectState {
  return {
    options: (option.modelOptions ?? []).map(function model(item) {
      return { label: item.label, value: item.model }
    }),
    selected
  }
}

/** Equal when ids, factories, and offered models match, so a rebuilt array keeps the resolver. */
export function sameResolverOptions(
  previous: WebMCPCommandInputResolverOption[] | undefined,
  next: WebMCPCommandInputResolverOption[] | undefined
): boolean {
  if (previous === next) return true
  if (!previous || !next || previous.length !== next.length) return false
  return previous.every(function matches(option, index) {
    const other = next[index]
    return (
      other !== undefined &&
      option.id === other.id &&
      option.createResolver === other.createResolver &&
      sameModels(option, other)
    )
  })
}

function sameModels(
  previous: WebMCPCommandInputResolverOption,
  next: WebMCPCommandInputResolverOption
): boolean {
  const previousModels = previous.modelOptions ?? []
  const nextModels = next.modelOptions ?? []
  return (
    previousModels.length === nextModels.length &&
    previousModels.every(function matches(item, index) {
      return item.model === nextModels[index]?.model
    })
  )
}
