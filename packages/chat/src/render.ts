import type { PiActivity, PiMessage, PiSnapshot } from '@vampaz/webmcp-kit/pi'
import type { ChatStatus, WebMCPChatLabels, WebMCPChatOptions } from './interfaces/chat'
import { icon } from './icon'

interface RenderedMessage {
  role: PiMessage['role']
  text: string
  label: string
  status: PiMessage['status']
  labels: WebMCPChatLabels
}

interface RenderedTool {
  label: string
  outcome: string
  preview: string
  sections: string
}

type TranscriptItem =
  | { layout: 'failed' | 'message'; message: PiMessage }
  | { layout: 'tools'; id: string; messages: PiMessage[] }

const toolIcons = {
  success: 'M20 6 9 17l-5-5',
  failed: 'M18 6 6 18M6 6l12 12',
  unknown: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01'
}
const chevron = 'm9 18 6-6-6-6'
const copyIcon = 'M8 8h12v12H8zM4 16V4h12'
const toolsIcon = 'M4 4h16v16H4zM8 10l2 2-2 2M12 14h4'
const previewLength = 120

// Values last written to each node, so unchanged messages skip DOM work.
const rendered = new WeakMap<HTMLElement, RenderedMessage>()
const renderedTools = new WeakMap<HTMLElement, RenderedTool>()
const renderedGroups = new WeakMap<HTMLElement, string>()

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
  for (const [index, item] of transcriptItems(messages).entries()) {
    const id = item.layout === 'tools' ? item.id : item.message.id
    let node = existing.get(id)
    if (node && node.dataset.layout !== item.layout) {
      node.remove()
      node = undefined
    }
    if (!node) node = createNode(id, item.layout)
    if (item.layout === 'tools') {
      if (renderTools(node, item.messages, labels)) changed = true
    } else if (renderText(node, item.message, item.layout, assistantLabel, labels, renderMessage))
      changed = true
    if (list.children.item(index) !== node) {
      list.insertBefore(node, list.children.item(index))
      changed = true
    }
    existing.delete(id)
  }
  for (const node of existing.values()) {
    node.remove()
    changed = true
  }
  return changed
}

/** Consecutive tool calls form one activity block; other messages stay separate. */
function transcriptItems(messages: readonly PiMessage[]): TranscriptItem[] {
  const items: TranscriptItem[] = []
  for (const message of messages) {
    const previous = items.at(-1)
    if (message.role === 'tool') {
      if (previous?.layout === 'tools') previous.messages.push(message)
      else items.push({ layout: 'tools', id: message.id, messages: [message] })
    } else
      items.push({
        layout: message.role === 'assistant' && message.failed ? 'failed' : 'message',
        message
      })
  }
  return items
}

function renderText(
  node: HTMLElement,
  message: PiMessage,
  layout: 'failed' | 'message',
  assistantLabel: string,
  labels: WebMCPChatLabels,
  renderMessage?: WebMCPChatOptions['renderMessage']
) {
  const label = messageLabel(message, assistantLabel, labels)
  const previous = rendered.get(node)
  if (
    previous &&
    previous.role === message.role &&
    previous.text === message.text &&
    previous.label === label &&
    previous.status === message.status &&
    previous.labels === labels
  )
    return false
  if (node.dataset.role !== message.role) {
    node.dataset.role = message.role
    node.setAttribute('part', `message message-${message.role}`)
  }
  setText(node.querySelector('strong')!, label)
  if (layout === 'failed') {
    setText(node.querySelector('.body')!, labels.responseFailedExplanation)
    setText(node.querySelector('summary')!, labels.responseFailedDetails)
    setText(node.querySelector('pre')!, message.text)
  } else {
    if (previous?.text !== message.text) {
      const body = node.querySelector<HTMLElement>('.body')!
      const custom = renderMessage?.(message, body) === true
      if (!custom) body.textContent = message.text
      body.toggleAttribute('data-custom', custom)
    }
    let copy = node.querySelector<HTMLButtonElement>('[data-copy]')
    if (message.role === 'assistant' && !copy) {
      const actions = document.createElement('div')
      actions.className = 'message-actions'
      copy = document.createElement('button')
      copy.type = 'button'
      copy.className = 'icon-button'
      copy.dataset.copy = ''
      copy.innerHTML = icon(copyIcon)
      actions.append(copy)
      node.append(actions)
    }
    if (copy) {
      copy.setAttribute('aria-label', labels.copyReply)
      copy.title = labels.copyReply
    }
  }
  rendered.set(node, {
    role: message.role,
    text: message.text,
    label,
    status: message.status,
    labels
  })
  return true
}

function renderTools(node: HTMLElement, messages: readonly PiMessage[], labels: WebMCPChatLabels) {
  let changed = false
  if (node.dataset.role !== 'tool') {
    node.dataset.role = 'tool'
    node.setAttribute('part', 'message message-tool')
  }
  const summary = node.querySelector<HTMLElement>('.tools-summary')!
  const heading = messages.length > 1 ? labels.toolsUsed(messages.length) : ''
  if (renderedGroups.get(node) !== heading) {
    renderedGroups.set(node, heading)
    setText(summary.querySelector('span')!, heading)
    summary.hidden = !heading
    changed = true
  }
  const calls = node.querySelector<HTMLElement>('.tool-calls')!
  const existing = new Map(
    Array.from(calls.children).map(function key(row) {
      return [(row as HTMLElement).dataset.id, row as HTMLElement]
    })
  )
  for (const [index, message] of messages.entries()) {
    const row = existing.get(message.id) ?? createToolRow(message.id)
    if (renderTool(row, message, labels)) changed = true
    if (calls.children.item(index) !== row) {
      calls.insertBefore(row, calls.children.item(index))
      changed = true
    }
    existing.delete(message.id)
  }
  for (const row of existing.values()) {
    row.remove()
    changed = true
  }
  return changed
}

function createNode(id: string, layout: TranscriptItem['layout']): HTMLElement {
  const node = document.createElement('li')
  node.dataset.id = id
  node.dataset.layout = layout
  if (layout === 'tools') {
    const summary = document.createElement('p')
    summary.className = 'tools-summary'
    summary.innerHTML = icon(toolsIcon)
    summary.append(document.createElement('span'))
    const calls = document.createElement('div')
    calls.className = 'tool-calls'
    node.append(summary, calls)
    return node
  }
  const body = document.createElement('div')
  body.className = 'body'
  node.append(document.createElement('strong'), body)
  if (layout === 'failed') {
    const details = document.createElement('details')
    details.append(document.createElement('summary'), document.createElement('pre'))
    node.append(details)
  }
  return node
}

function createToolRow(id: string): HTMLElement {
  const row = document.createElement('details')
  row.className = 'tool-call'
  row.dataset.id = id
  const summary = document.createElement('summary')
  summary.innerHTML = `<span class="tool-state" aria-hidden="true"></span><span class="tool-line" aria-hidden="true"><code class="tool-name"></code><code class="tool-args"></code><span class="tool-outcome"></span></span><span class="visually-hidden"></span>${icon(chevron).replace('<svg', '<svg class="tool-chevron"')}`
  const sections = document.createElement('div')
  sections.className = 'tool-sections'
  row.append(summary, sections)
  return row
}

function renderTool(row: HTMLElement, message: PiMessage, labels: WebMCPChatLabels) {
  const tone = toolTone(message)
  const name = message.toolName ?? labels.tool
  const label = messageLabel(message, '', labels)
  const outcome =
    tone === 'unknown' ? labels.toolStatusUnknown : tone === 'failed' ? labels.toolStatusFailed : ''
  const preview = argumentPreview(message.input)
  const sections = JSON.stringify([
    labels.toolInput,
    labels.toolOutput,
    labels.toolResult,
    message.input === undefined ? null : formatValue(message.input),
    message.output === undefined ? null : formatValue(message.output),
    message.text
  ])
  const previous = renderedTools.get(row)
  if (
    previous &&
    previous.label === label &&
    previous.outcome === outcome &&
    previous.preview === preview &&
    previous.sections === sections
  )
    return false
  if (row.dataset.status !== tone) {
    row.dataset.status = tone
    row.querySelector('.tool-state')!.innerHTML = icon(toolIcons[tone])
  }
  setText(row.querySelector('.tool-name')!, name)
  const args = row.querySelector<HTMLElement>('.tool-args')!
  setText(args, preview)
  args.hidden = !preview
  const status = row.querySelector<HTMLElement>('.tool-outcome')!
  setText(status, outcome)
  status.hidden = !outcome
  setText(row.querySelector('summary .visually-hidden')!, label)
  if (previous?.sections !== sections) {
    const parts: HTMLElement[] = []
    if (message.input !== undefined) parts.push(toolSection(labels.toolInput, message.input))
    parts.push(
      message.output === undefined
        ? toolSection(labels.toolResult, message.text)
        : toolSection(labels.toolOutput, message.output)
    )
    row.querySelector('.tool-sections')!.replaceChildren(...parts)
  }
  renderedTools.set(row, { label, outcome, preview, sections })
  return true
}

function toolTone(message: PiMessage): keyof typeof toolIcons {
  if (message.status === 'unknown') return 'unknown'
  return message.failed || (message.status !== undefined && message.status !== 'success')
    ? 'failed'
    : 'success'
}

/** One-line `name: value` summary of tool arguments for the collapsed row. */
function argumentPreview(input: Record<string, unknown> | undefined): string {
  if (!input) return ''
  const text = Object.entries(input)
    .map(function entry([key, value]) {
      let shown: string
      try {
        shown = JSON.stringify(value) ?? String(value)
      } catch {
        shown = String(value)
      }
      return `${key}: ${shown}`
    })
    .join(', ')
  return text.length > previewLength ? `${text.slice(0, previewLength - 1)}…` : text
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
