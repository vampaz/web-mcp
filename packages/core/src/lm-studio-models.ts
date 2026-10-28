import type { LmStudioModelOption } from './interfaces/model'

/** Lists LM Studio chat models without sending application credentials. */
export async function listLmStudioModels(
  serverUrl = 'http://127.0.0.1:1234',
  signal?: AbortSignal
): Promise<LmStudioModelOption[]> {
  const deadline = AbortSignal.timeout(10_000)
  const response = await fetch(`${serverUrl.replace(/\/$/, '')}/api/v1/models`, {
    headers: { Accept: 'application/json' },
    credentials: 'omit',
    signal: signal ? AbortSignal.any([signal, deadline]) : deadline
  }).catch(function connectionFailed(error: unknown) {
    if (error instanceof TypeError)
      throw new Error(
        `Could not reach LM Studio at ${serverUrl}. Start the server and enable CORS.`
      )
    throw error
  })
  if (!response.ok) throw new Error(`LM Studio returned ${response.status} while listing models.`)
  const payload = await response.json()
  if (!Array.isArray(payload?.models)) throw new Error('LM Studio returned an invalid model list.')
  const models: LmStudioModelOption[] = []
  for (const entry of payload.models) {
    if (entry?.type !== 'llm') continue
    if (typeof entry.key !== 'string' || !entry.key || !Array.isArray(entry.loaded_instances))
      throw new Error('LM Studio returned an invalid chat model.')
    const label =
      typeof entry.display_name === 'string' && entry.display_name ? entry.display_name : entry.key
    if (!entry.loaded_instances.length) models.push({ model: entry.key, label, loaded: false })
    for (const instance of entry.loaded_instances) {
      if (typeof instance?.id !== 'string' || !instance.id)
        throw new Error('LM Studio returned an invalid model instance.')
      models.push({
        model: instance.id,
        label: entry.loaded_instances.length > 1 ? `${label} (${instance.id})` : label,
        loaded: true
      })
    }
  }
  return models.sort(
    (left, right) =>
      Number(right.loaded) - Number(left.loaded) || left.label.localeCompare(right.label)
  )
}
