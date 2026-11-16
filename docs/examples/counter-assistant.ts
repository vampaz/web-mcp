import {
  defineTool,
  registerTool,
  type ConfirmationHandler,
  type ToolResolver
} from '@vampaz/webmcp-kit'
import type { PiSession } from '@vampaz/webmcp-kit/pi'
import { mountAssistant } from '@vampaz/webmcp-kit/assistant'

// Call this in the browser. The host owns the resolver and approval dialog.
export function mountCounterAssistant(options: {
  container: HTMLElement
  session: PiSession
  resolver: ToolResolver
  approve: ConfirmationHandler
  onValue(value: number): void
}) {
  let value = 0
  const read = registerTool(
    defineTool({
      name: 'read_counter',
      description: 'Read the application counter.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute() {
        return { value }
      }
    })
  )
  const write = registerTool(
    defineTool({
      name: 'set_counter',
      description: 'Set the application counter to an integer from 0 to 100 after approval.',
      inputSchema: {
        type: 'object',
        properties: { value: { type: 'integer', minimum: 0, maximum: 100 } },
        required: ['value'],
        additionalProperties: false
      },
      confirmation: { reason: 'Change the counter?', handler: options.approve },
      execute(input) {
        value = input.value
        options.onValue(value)
        return { value }
      }
    })
  )

  const assistant = mountAssistant({
    container: options.container,
    session: options.session,
    resolver: options.resolver,
    context() {
      return { counter: value }
    },
    chat: {
      title: 'Counter assistant',
      suggestedPrompts: ['Read the counter', 'Set the counter to 7']
    }
  })

  // Keep the route's tool table clean when initialization fails.
  void assistant.ready.catch(function failed() {
    read.unregister()
    write.unregister()
  })

  return {
    ready: assistant.ready,
    async destroy() {
      read.unregister()
      write.unregister()
      await assistant.destroy()
    }
  }
}
