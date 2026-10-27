export function chatModels(payload: {
  data?: { id?: unknown; type?: unknown; state?: unknown }[]
}): { model: string; label: string }[] {
  if (!Array.isArray(payload.data)) throw new Error('LM Studio returned an invalid model list.')
  return payload.data
    .filter(
      (model): model is { id: string; type: unknown; state: unknown } =>
        typeof model.id === 'string' &&
        model.id.length > 0 &&
        model.id.length <= 200 &&
        !/[\r\n]/.test(model.id) &&
        (model.type === 'llm' || model.type === 'vlm')
    )
    .sort(function loadedFirst(left, right) {
      return (
        Number(right.state === 'loaded') - Number(left.state === 'loaded') ||
        left.id.localeCompare(right.id)
      )
    })
    .map(function option(model) {
      return { model: model.id, label: model.id }
    })
}
