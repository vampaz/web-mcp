import type { ConfirmationRequest } from '@vampaz/webmcp-kit'
import type { DialogApproval } from './interfaces/assistant'

/**
 * Builds the approval callback for the dialog markup in the integration guide.
 * The dialog needs `[data-approval-text]` and a method="dialog" form whose buttons
 * use value="deny" and value="approve".
 */
export function createDialogApproval(dialog: HTMLDialogElement): DialogApproval {
  const description = dialog.querySelector<HTMLElement>('[data-approval-text]')
  if (!description) throw new Error('The approval dialog needs [data-approval-text].')
  let pending: ((approved: boolean) => void) | undefined

  function cancel() {
    pending?.(false)
  }

  function confirm({ tool, input, reason, signal }: ConfirmationRequest): Promise<boolean> {
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
      description!.textContent = `${reason}\n${tool.name}\n${summarize(input)}`
      dialog.returnValue = ''
      dialog.addEventListener('close', close)
      dialog.addEventListener('cancel', cancel, { once: true })
      signal?.addEventListener('abort', cancel, { once: true })
      if (signal?.aborted) cancel()
      else {
        try {
          dialog.showModal()
        } catch {
          finish(false)
        }
      }
    })
  }

  return { confirm, cancel }
}

function summarize(input: unknown): string {
  try {
    const text = JSON.stringify(input)
    if (typeof text !== 'string') return String(input)
    return text.length > 500 ? `${text.slice(0, 499)}…` : text
  } catch {
    return '[unserializable input]'
  }
}
