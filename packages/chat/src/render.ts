import type { PiActivity, PiMessage, PiSnapshot } from '@vampaz/webmcp-kit/pi'
import type { ChatStatus, WebMCPChatLabels, WebMCPChatOptions } from './interfaces/chat'

interface RenderedMessage {
  role: PiMessage['role']
  text: string
  label: string
  status: PiMessage['status']
  labels: WebMCPChatLabels
}

// Values last written to each node, so unchanged messages skip DOM work.
const rendered = new WeakMap<HTMLElement, RenderedMessage>()

/** Returns whether the transcript DOM changed. */
export function updateTranscript(
  list: HTMLOListElement,
  messages: readonly PiMessage[],
  assistantLabel: string,
  labels: WebMCPChatLabels,
  renderMessage?: WebMCPChatOptions['renderMessage']
): boolean {
  let changed = false
  const existing = new Map(
    Array.from(list.children).map(function key(node) {
      return [(node as HTMLElement).dataset.id, node as HTMLElement]
    })
  )
  for (const [index, message] of messages.entries()) {
    const failedAnswer = message.role === 'assistant' && Boolean(message.failed)
    const layout = failedAnswer ? 'failed' : message.role === 'tool' ? 'details' : 'message'
    let node = existing.get(message.id)
    if (node && node.dataset.layout !== layout) {
      node.remove()
      node = undefined
    }
    if (!node) node = createNode(message.id, layout)
    const label = messageLabel(message, assistantLabel, labels)
    const previous = rendered.get(node)
    if (
      !previous ||
      previous.role !== message.role ||
      previous.text !== message.text ||
      previous.label !== label ||
      previous.status !== message.status ||
      previous.labels !== labels
    ) {
      changed = true
      if (node.dataset.role !== message.role) {
        node.dataset.role = message.role
        node.setAttribute('part', `message message-${message.role}`)
      }
      setText(node.querySelector('strong,summary')!, label)
      if (layout === 'details') renderTool(node, message, labels)
      else if (layout === 'failed') {
        setText(node.querySelector('.body')!, labels.responseFailedExplanation)
        setText(node.querySelector('summary')!, labels.responseFailedDetails)
        setText(node.querySelector('pre')!, message.text)
      } else if (previous?.text !== message.text) {
        const body = node.querySelector<HTMLElement>('.body')!
        const custom = renderMessage?.(message, body) === true
        if (!custom) body.textContent = message.text
        body.toggleAttribute('data-custom', custom)
      }
      rendered.set(node, {
        role: message.role,
        text: message.text,
        label,
        status: message.status,
        labels
      })
    }
    if (list.children.item(index) !== node) {
      list.insertBefore(node, list.children.item(index))
      changed = true
    }
    existing.delete(message.id)
  }
  for (const node of existing.values()) {
    node.remove()
    changed = true
  }
  return changed
}

function createNode(id: string, layout: 'failed' | 'details' | 'message'): HTMLElement {
  const node = document.createElement('li')
  node.dataset.id = id
  node.dataset.layout = layout
  if (layout !== 'details') {
    const body = document.createElement('div')
    body.className = 'body'
    node.append(document.createElement('strong'), body)
  }
  if (layout !== 'message') {
    const details = document.createElement('details')
    const content = document.createElement(layout === 'details' ? 'div' : 'pre')
    if (layout === 'details') content.className = 'tool-sections'
    details.append(document.createElement('summary'), content)
    node.append(details)
  }
  return node
}

function messageLabel(message: PiMessage, assistantLabel: string, labels: WebMCPChatLabels) {
  if (message.role === 'user') return labels.user
  if (message.role === 'assistant')
    return message.failed ? labels.responseFailed(assistantLabel) : assistantLabel
  const name = message.toolName ?? labels.tool
  if (message.status === 'unknown') return labels.toolUnknown(name)
  return message.failed || (message.status !== undefined && message.status !== 'success')
    ? labels.toolFailed(name)
    : name
}

function renderTool(node: HTMLElement, message: PiMessage, labels: WebMCPChatLabels) {
  const sections: HTMLElement[] = []
  if (message.input !== undefined) sections.push(toolSection(labels.toolInput, message.input))
  sections.push(
    message.output === undefined
      ? toolSection(labels.toolResult, message.text)
      : toolSection(labels.toolOutput, message.output)
  )
  node.querySelector('.tool-sections')!.replaceChildren(...sections)
}

function toolSection(heading: string, value: unknown): HTMLElement {
  const section = document.createElement('div')
  const title = document.createElement('p')
  const pre = document.createElement('pre')
  const code = document.createElement('code')
  section.className = 'tool-section'
  title.className = 'tool-heading'
  title.textContent = heading
  code.textContent = formatValue(value)
  pre.append(code)
  section.append(title, pre)
  return section
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    // Circular or BigInt values cannot be serialized; show what the runtime can.
    return String(value)
  }
}

function setText(node: Element, text: string) {
  if (node.textContent !== text) node.textContent = text
}

export function statusText(snapshot: PiSnapshot, labels: WebMCPChatLabels): ChatStatus {
  if (snapshot.error) return { text: snapshot.error.message, tone: 'error' }
  if (snapshot.state === 'idle' && snapshot.messages.at(-1)?.failed)
    return { text: labels.status.lastFailed, tone: 'error' }
  if (snapshot.state === 'error') return { text: labels.status.error, tone: 'error' }
  // Idle needs no announcement; active turns are reported by the working indicator.
  if (snapshot.state === 'loading') return { text: labels.status.loading }
  if (snapshot.state === 'interrupted') return { text: labels.status.interrupted }
  if (snapshot.state === 'closed') return { text: labels.status.closed }
  return { text: '' }
}

export function activityText(activity: PiActivity | undefined, labels: WebMCPChatLabels): string {
  if (!activity) return labels.working
  if (activity.kind === 'resolving') return labels.thinking
  if (activity.kind === 'compacting') return labels.compacting
  return activity.phase === 'approval'
    ? labels.awaitingApproval(activity.toolName)
    : labels.runningTool(activity.toolName)
}
