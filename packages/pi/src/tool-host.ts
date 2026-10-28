import { invokeTool, subscribeWebMCPKitEvents } from '@vampaz/webmcp-kit'
import { listAvailableTools } from '../../core/src/registry'
import type { ConfirmationEventDetail, ResolverContext } from '@vampaz/webmcp-kit'
import type { PiToolHost, RegistryToolHostOptions } from './interfaces/host'
import { PiFailure } from './errors'

export function createRegistryToolHost(
  context: () => ResolverContext | Promise<ResolverContext> = function empty() {
    return {}
  },
  options: RegistryToolHostOptions = {}
): PiToolHost {
  let previous: unknown[] = []
  let revision = 0
  let schema = ''
  async function discover(signal: AbortSignal) {
    signal.throwIfAborted()
    const registrations = listAvailableTools().filter(({ tool }) => options.include?.(tool) ?? true)
    const tools = registrations.map(function describe({ tool }) {
      return {
        name: tool.name,
        description: tool.description,
        inputSchema: structuredClone(tool.inputSchema),
        ...(tool.outputSchema ? { outputSchema: structuredClone(tool.outputSchema) } : {}),
        ...(tool.annotations ? { annotations: structuredClone(tool.annotations) } : {})
      }
    })
    const nextSchema = JSON.stringify(tools)
    if (
      schema !== nextSchema ||
      registrations.length !== previous.length ||
      registrations.some(function changed(value, index) {
        return value !== previous[index]
      })
    )
      revision++
    previous = registrations
    schema = nextSchema
    return { revision: String(revision), tools }
  }
  return {
    discover,
    async context(signal) {
      signal.throwIfAborted()
      return context()
    },
    async invoke(call, signal, progress) {
      const current = await discover(signal)
      if (
        current.revision !== call.revision ||
        !current.tools.some((tool) => tool.name === call.name)
      )
        throw new PiFailure('stale_document', 'The tool catalog changed. Send a new request.')
      const id = `pi_${crypto.randomUUID()}`
      // Approval events carry the invocation ID, so the activity shows when the app asks the user.
      const unsubscribe = subscribeWebMCPKitEvents(function phase(event) {
        const detail = event.detail as ConfirmationEventDetail | undefined
        if (detail?.id !== id) return
        if (event.type === 'confirmation-requested') progress?.('approval')
        else if (event.type === 'confirmation-settled') progress?.('running')
      })
      try {
        return await invokeTool({
          id,
          toolName: call.name,
          input: call.input,
          source: 'pi',
          signal
        })
      } finally {
        unsubscribe()
      }
    }
  }
}
