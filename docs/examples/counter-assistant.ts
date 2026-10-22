import {
  defineTool,
  registerTool,
  type ConfirmationHandler,
  type ConfirmationRequest,
  type ToolResolver
} from '@vampaz/webmcp-kit'
import { createPiHarness, type PiController, type PiSession } from '@vampaz/webmcp-kit/pi'
import { defineWebMCPChat, type WebMCPChatElement } from '@vampaz/webmcp-kit/chat'

// Call this in the browser. The host owns the resolver and approval dialog.
export function mountCounterAssistant(options: {
  container: HTMLElement
  session: PiSession
  resolver: ToolResolver
  approve: ConfirmationHandler
  onValue(value: number): void
}) {
  let value = 0
  let closed = false
  let harness: PiController | undefined
  let element: WebMCPChatElement | undefined
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

  async function start() {
    try {
      const next = await createPiHarness({
        session: options.session,
        resolver: options.resolver,
        context() {
          return { counter: value }
        }
      })
      if (closed) {
        await next.destroy()
        return
      }
      harness = next
      defineWebMCPChat()
      element = document.createElement('webmcp-chat') as WebMCPChatElement
      element.configure({
        controller: harness,
        mode: 'popup',
        title: 'Counter assistant',
        suggestedPrompts: ['Read the counter', 'Set the counter to 7']
      })
      options.container.append(element)
    } catch (error) {
      await destroy()
      throw error
    }
  }

  async function destroy() {
    closed = true
    element?.remove()
    read.unregister()
    write.unregister()
    await harness?.destroy()
  }

  return { ready: start(), destroy }
}

// The dialog needs [data-approval-text] and a method="dialog" form whose
// buttons use value="deny" and value="approve". The guide supplies the markup.
export function createDialogApproval(dialog: HTMLDialogElement) {
  const description = dialog.querySelector<HTMLElement>('[data-approval-text]')
  if (!description) throw new Error('The approval dialog needs [data-approval-text].')
  let pending: ((approved: boolean) => void) | undefined

  function cancel() {
    pending?.(false)
  }

  function confirm({ tool, input, reason, signal }: ConfirmationRequest) {
    cancel()
    return new Promise<boolean>(function approval(resolve) {
      function finish(approved: boolean) {
        pending = undefined
        signal?.removeEventListener('abort', cancel)
        dialog.removeEventListener('close', close)
        dialog.removeEventListener('cancel', cancel)
        if (dialog.open) dialog.close()
        resolve(approved)
      }
      function close() {
        if (!dialog.open) finish(dialog.returnValue === 'approve')
      }
      pending = finish
      description!.textContent = `${reason}\n${tool.name}\n${JSON.stringify(input, null, 2)}`
      dialog.returnValue = ''
      dialog.addEventListener('close', close)
      dialog.addEventListener('cancel', cancel, { once: true })
      signal?.addEventListener('abort', cancel, { once: true })
      if (signal?.aborted) cancel()
      else dialog.showModal()
    })
  }

  return { confirm, cancel }
}
