import { defineTool, registerTool, setConfirmationHandler } from '@vampaz/webmcp-kit'

export function registerCounterTools(onChange: (value: number) => void) {
  let value = 0
  const read = registerTool(
    defineTool({
      name: 'read_counter',
      description: 'Read the current value of the visible application counter.',
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
      description:
        'Set the visible application counter to an integer between zero and one hundred, with user approval.',
      inputSchema: {
        type: 'object',
        properties: { value: { type: 'integer', minimum: 0, maximum: 100 } },
        required: ['value'],
        additionalProperties: false
      },
      confirmation: { reason: 'Change the application counter?' },
      execute(input) {
        value = input.value
        onChange(value)
        return { value }
      }
    })
  )
  return {
    getValue() {
      return value
    },
    destroy() {
      read.unregister()
      write.unregister()
    }
  }
}

export function installApprovalDialog(dialog: HTMLDialogElement): () => void {
  let pending: ((approved: boolean) => void) | undefined
  let cleanup: (() => void) | undefined
  function cancel() {
    pending?.(false)
  }
  const disposeConfirmation = setConfirmationHandler(function confirm({ input, reason, signal }) {
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
        // A previous dialog.close() can dispatch after the next approval has opened.
        if (dialog.open) return
        finish(dialog.returnValue === 'approve')
      }
      pending = finish
      cleanup = function remove() {
        finish(false)
      }
      dialog.querySelector('#approval-action')!.textContent =
        `${reason}\nNew value: ${(input as { value: number }).value}`
      dialog.returnValue = ''
      dialog.addEventListener('close', close)
      dialog.addEventListener('cancel', cancel, { once: true })
      signal?.addEventListener('abort', cancel, { once: true })
      dialog.showModal()
      if (signal?.aborted) cancel()
    })
  })
  return function remove() {
    cleanup?.()
    disposeConfirmation()
  }
}
