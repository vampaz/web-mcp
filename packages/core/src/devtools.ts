import type { JsonSchema, ToolInvocationResult, WebMCPKitEvent } from './interfaces/tool'
import { invokeTool, listTools } from './registry'
import { getSupportLabel } from './support'
import { subscribeWebMCPKitEvents } from './events'

export interface DevtoolsOverlay {
  refresh: () => void
  destroy: () => void
}

export interface MountDevtoolsOptions {
  container?: HTMLElement
  initiallyOpen?: boolean
}

interface HistoryItem {
  toolName: string
  status: ToolInvocationResult['status']
  detail: string
}

const overlayStyles = `
.wmk-devtools {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 2147483647;
  width: min(460px, calc(100vw - 36px));
  color: #f4f0e8;
  font-family: Avenir Next, Avenir, Corbel, Segoe UI, sans-serif;
}
.wmk-devtools button,
.wmk-devtools textarea {
  font: inherit;
}
.wmk-devtools__toggle {
  float: right;
  border: 1px solid #e8be53;
  background: #e8be53;
  color: #0c1110;
  padding: 11px 14px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.34);
}
.wmk-devtools__panel {
  clear: both;
  display: grid;
  gap: 12px;
  max-height: min(720px, calc(100vh - 96px));
  overflow: auto;
  margin-top: 12px;
  padding: 16px;
  border: 1px solid rgba(244, 240, 232, 0.18);
  background: rgba(9, 11, 11, 0.94);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.46);
  backdrop-filter: blur(18px);
}
.wmk-devtools__panel[hidden] {
  display: none;
}
.wmk-devtools__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
}
.wmk-devtools__eyebrow,
.wmk-devtools__meta,
.wmk-devtools__warning,
.wmk-devtools__history {
  color: #9ea8a1;
  font-size: 12px;
}
.wmk-devtools__title {
  margin: 3px 0 0;
  font-family: Georgia, Cambria, serif;
  font-size: 28px;
  line-height: 1;
}
.wmk-devtools__status {
  color: #30a779;
  font-size: 12px;
  font-weight: 800;
  text-align: right;
}
.wmk-devtools__tool {
  display: grid;
  gap: 9px;
  padding: 12px;
  border: 1px solid rgba(244, 240, 232, 0.13);
  background: rgba(244, 240, 232, 0.05);
}
.wmk-devtools__tool strong {
  color: #f4f0e8;
}
.wmk-devtools__tool p {
  margin: 0;
  color: #c9d1cb;
  line-height: 1.35;
}
.wmk-devtools__tool textarea {
  min-height: 88px;
  width: 100%;
  resize: vertical;
  border: 1px solid rgba(244, 240, 232, 0.18);
  background: #f4f0e8;
  color: #0c1110;
  padding: 10px;
}
.wmk-devtools__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.wmk-devtools__actions button {
  border: 1px solid rgba(244, 240, 232, 0.18);
  background: rgba(244, 240, 232, 0.08);
  color: #f4f0e8;
  padding: 8px 10px;
  cursor: pointer;
}
.wmk-devtools__actions button:first-child {
  border-color: #30a779;
  background: #30a779;
  color: #08100d;
  font-weight: 800;
}
.wmk-devtools__warning {
  border-left: 3px solid #e8be53;
  padding-left: 8px;
}
.wmk-devtools__history {
  display: grid;
  gap: 6px;
  border-top: 1px solid rgba(244, 240, 232, 0.13);
  padding-top: 12px;
}
`

export function mountDevtoolsOverlay(options: MountDevtoolsOptions = {}): DevtoolsOverlay {
  const root = document.createElement('section')
  root.className = 'wmk-devtools'
  root.setAttribute('aria-label', 'WebMCP Kit devtools')

  const style = document.createElement('style')
  style.textContent = overlayStyles

  const target = options.container ?? document.body
  target.append(style, root)

  let open = options.initiallyOpen ?? true
  const history: HistoryItem[] = []

  const unsubscribe = subscribeWebMCPKitEvents(function handleEvent(event) {
    if (event.type === 'succeeded' || event.type === 'failed' || event.type === 'blocked') {
      history.unshift(toHistoryItem(event))
      history.splice(5)
    }
    render()
  })

  root.addEventListener('click', function handleClick(event) {
    const targetElement = event.target
    if (!(targetElement instanceof HTMLElement)) return

    const action = targetElement.dataset.action
    if (action === 'toggle') {
      open = !open
      render()
      return
    }

    if (action === 'sample') {
      const textarea = root.querySelector<HTMLTextAreaElement>(`textarea[data-tool-name="${targetElement.dataset.toolName}"]`)
      const registration = listTools().find((item) => item.tool.name === targetElement.dataset.toolName)
      if (textarea && registration) {
        textarea.value = JSON.stringify(createSampleInput(registration.tool.inputSchema), null, 2)
      }
      return
    }

    if (action === 'invoke') {
      void invokeFromOverlay(String(targetElement.dataset.toolName))
    }
  })

  render()

  return {
    refresh: render,
    destroy() {
      unsubscribe()
      root.remove()
      style.remove()
    }
  }

  function render() {
    const registrations = listTools()
    root.innerHTML = `
      <button class="wmk-devtools__toggle" type="button" data-action="toggle">
        ${open ? 'Hide' : 'Tools'} (${registrations.length})
      </button>
      <div class="wmk-devtools__panel" ${open ? '' : 'hidden'}>
        <header class="wmk-devtools__header">
          <div>
            <div class="wmk-devtools__eyebrow">WebMCP Kit</div>
            <h2 class="wmk-devtools__title">Tool Inspector</h2>
          </div>
          <div class="wmk-devtools__status">${escapeHtml(getSupportLabel())}</div>
        </header>
        ${registrations.map((registration) => `
          <article class="wmk-devtools__tool">
            <div class="wmk-devtools__meta">${escapeHtml(registration.mode)}</div>
            <strong>${escapeHtml(registration.tool.name)}</strong>
            <p>${escapeHtml(registration.tool.description)}</p>
            ${registration.warnings.map((warning) => `<div class="wmk-devtools__warning">${escapeHtml(warning)}</div>`).join('')}
            <textarea data-tool-name="${escapeHtml(registration.tool.name)}">${escapeHtml(JSON.stringify(createSampleInput(registration.tool.inputSchema), null, 2))}</textarea>
            <div class="wmk-devtools__actions">
              <button type="button" data-action="invoke" data-tool-name="${escapeHtml(registration.tool.name)}">Invoke</button>
              <button type="button" data-action="sample" data-tool-name="${escapeHtml(registration.tool.name)}">Sample</button>
            </div>
          </article>
        `).join('')}
        <div class="wmk-devtools__history">
          <strong>Invocation history</strong>
          ${history.length === 0 ? '<span>No invocations yet.</span>' : history.map((item) => `
            <span>${escapeHtml(item.toolName)} - ${escapeHtml(item.status)} - ${escapeHtml(item.detail)}</span>
          `).join('')}
        </div>
      </div>
    `
  }

  async function invokeFromOverlay(toolName: string) {
    const textarea = root.querySelector<HTMLTextAreaElement>(`textarea[data-tool-name="${toolName}"]`)
    const input = textarea?.value ? JSON.parse(textarea.value) as Record<string, unknown> : {}
    const registration = listTools().find((item) => item.tool.name === toolName)
    const confirmed = registration?.tool.confirmation?.required ? window.confirm(registration.tool.confirmation.reason) : true

    const result = await invokeTool({
      toolName,
      input,
      confirmed,
      source: 'devtools'
    })

    history.unshift({
      toolName,
      status: result.status,
      detail: result.error ?? 'Completed'
    })
    history.splice(5)
    render()
  }
}

function createSampleInput(schema: JsonSchema): Record<string, unknown> {
  const sample: Record<string, unknown> = {}

  for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
    sample[key] = createSampleValue(key, propertySchema)
  }

  return sample
}

function createSampleValue(key: string, schema: JsonSchema): unknown {
  if (schema.enum?.length) return schema.enum[0]
  if (schema.type === 'number' || schema.type === 'integer') return schema.minimum ?? 1
  if (schema.type === 'boolean') return true
  if (schema.type === 'array') return []
  if (key.toLowerCase().includes('email')) return 'person@example.com'
  if (key.toLowerCase().includes('amount')) return 100
  if (key.toLowerCase().includes('quantity')) return 1
  if (key.toLowerCase().includes('id')) return 'sample-id'
  if (key.toLowerCase().includes('name')) return 'Acme Corp'
  return 'Sample value'
}

function toHistoryItem(event: WebMCPKitEvent): HistoryItem {
  const result = event.detail as ToolInvocationResult | undefined

  return {
    toolName: event.toolName,
    status: result?.status ?? (event.type === 'succeeded' ? 'success' : 'error'),
    detail: result?.error ?? 'Completed'
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
