import type { PiMessage, PiSnapshot } from '@vampaz/webmcp-kit/pi'

export function updateTranscript(
  list: HTMLOListElement,
  messages: readonly PiMessage[],
  assistantLabel: string
): void {
  const existing = new Map(
    Array.from(list.children).map(function key(node) {
      return [(node as HTMLElement).dataset.id, node as HTMLElement]
    })
  )
  for (const [index, message] of messages.entries()) {
    const failedAnswer = message.role === 'assistant' && Boolean(message.failed)
    const detailsOnly = message.role === 'tool'
    const layout = failedAnswer ? 'failed' : detailsOnly ? 'details' : 'message'
    let node = existing.get(message.id)
    if (node && node.dataset.layout !== layout) {
      node.remove()
      node = undefined
    }
    if (!node) {
      node = document.createElement('li')
      node.dataset.id = message.id
      node.dataset.layout = layout
      if (!detailsOnly) node.append(document.createElement('strong'), document.createElement('p'))
      if (detailsOnly || failedAnswer) {
        const details = document.createElement('details')
        details.append(document.createElement('summary'), document.createElement('pre'))
        node.append(details)
      }
    }
    node.dataset.role = message.role
    const label =
      message.role === 'user'
        ? 'You'
        : message.role === 'tool'
          ? `${message.toolName ?? 'Tool'}${message.failed ? ' — failed' : ''}`
          : `${assistantLabel}${failedAnswer ? ' — response failed' : ''}`
    const labelNode = node.querySelector('strong,summary')!
    const textNode = node.querySelector(failedAnswer ? 'pre' : 'p,pre')!
    if (labelNode.textContent !== label) labelNode.textContent = label
    if (textNode.textContent !== message.text) textNode.textContent = message.text
    if (failedAnswer) {
      const explanation =
        'This response could not be completed. Check application state before sending a new request.'
      if (node.querySelector('p')!.textContent !== explanation) {
        node.querySelector('p')!.textContent = explanation
        node.querySelector('summary')!.textContent = 'Response details'
      }
    }
    if (list.children.item(index) !== node) list.insertBefore(node, list.children.item(index))
    existing.delete(message.id)
  }
  for (const node of existing.values()) node.remove()
}

export function statusText(snapshot: PiSnapshot): string {
  if (snapshot.error) return snapshot.error.message
  if (snapshot.state === 'idle' && snapshot.messages.at(-1)?.failed)
    return 'The last response failed. Check application state before sending a new request.'
  // Active turns are reported by the working indicator in the transcript.
  if (snapshot.state === 'running' || snapshot.state === 'stopping') return ''
  return {
    loading: 'Loading conversation…',
    idle: 'Ready',
    interrupted:
      'The previous turn was interrupted. Check application state, then send a new request.',
    error: 'The turn failed. Check the application and try a new request.',
    closed: 'Conversation closed.'
  }[snapshot.state]
}
