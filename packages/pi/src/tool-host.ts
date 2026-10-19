import { invokeTool, listTools } from '@vampaz/webmcp-kit'
import type { ResolverContext } from '@vampaz/webmcp-kit'
import type { PiToolHost } from './interfaces/host'
import { PiFailure } from './errors'

export function createRegistryToolHost(
  context: () => ResolverContext | Promise<ResolverContext> = function empty() {
    return {}
  }
): PiToolHost {
  let previous: unknown[] = []
  let revision = 0
  let schema = ''
  async function discover(signal: AbortSignal) {
    signal.throwIfAborted()
    const registrations = listTools().filter(function available({ tool }) {
      try {
        return tool.scope?.().available !== false
      } catch {
        return false
      }
    })
    const tools = registrations.map(function describe({ tool }) {
      return {
        name: tool.name,
        description: tool.description,
        inputSchema: structuredClone(tool.inputSchema)
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
    async invoke(call, signal) {
      const current = await discover(signal)
      if (current.revision !== call.revision)
        throw new PiFailure('stale_document', 'The tool catalog changed. Send a new request.')
      return invokeTool({ toolName: call.name, input: call.input, source: 'resolver', signal })
    }
  }
}
