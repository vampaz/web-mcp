import {
  escapeAttribute,
  escapeHtml,
  getIntegrationHealthReport,
  getSupportLabel,
  invokeTool,
  listTools,
  subscribeWebMCPKitEvents,
  type IntegrationDiagnostic,
  type JsonSchema,
  type ToolInvocation,
  type ToolInvocationResult,
  type WebMCPKitEvent,
  type WebMCPTool
} from 'webmcp-kit'

export interface DevtoolsOverlay {
  refresh: () => void
  destroy: () => void
}

export interface MountDevtoolsOptions {
  container?: HTMLElement
  initiallyOpen?: boolean
  placement?: 'fixed' | 'inline'
}

interface HistoryItem {
  id: number
  toolName: string
  status: ToolInvocationResult['status']
  input: Record<string, unknown>
  output?: unknown
  durationMs?: number
  detail: string
}

const overlayStyles = `
.wmk-devtools {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 2147483647;
  width: min(460px, calc(100vw - 36px));
  color: #f7faf8;
  font: 500 14px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.wmk-devtools--inline {
  position: static;
  width: 100%;
}
.wmk-devtools button,
.wmk-devtools textarea {
  font: inherit;
}
.wmk-devtools button:focus-visible,
.wmk-devtools textarea:focus-visible,
.wmk-devtools summary:focus-visible {
  outline: 2px solid #50d7a1;
  outline-offset: 2px;
}
.wmk-devtools__toggle {
  float: right;
  border: 1px solid #1e9f72;
  background: #1e9f72;
  color: #06100c;
  padding: 10px 14px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.26);
  transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
}
.wmk-devtools__toggle:hover {
  border-color: #34c995;
  background: #34c995;
  transform: translateY(-1px);
}
.wmk-devtools--inline .wmk-devtools__toggle {
  float: none;
  width: 100%;
  margin-top: 0;
  border: 0;
  border-top: 1px solid rgba(224, 234, 229, 0.08);
  border-bottom: 1px solid rgba(224, 234, 229, 0.1);
  border-radius: 0;
  background: rgba(255, 255, 255, 0.035);
  color: #e9f0ec;
  box-shadow: none;
  transform: none;
}
.wmk-devtools__panel {
  clear: both;
  display: grid;
  gap: 12px;
  max-height: min(720px, calc(100vh - 96px));
  overflow: auto;
  margin-top: 12px;
  padding: 14px;
  border: 1px solid rgba(224, 234, 229, 0.14);
  background: rgba(9, 17, 14, 0.96);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(18px);
}
.wmk-devtools--inline .wmk-devtools__panel {
  max-height: none;
  margin-top: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.wmk-devtools__panel[hidden] {
  display: none;
}
.wmk-devtools__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
  padding: 2px 2px 6px;
}
.wmk-devtools__eyebrow,
.wmk-devtools__meta,
.wmk-devtools__warning,
.wmk-devtools__preview,
.wmk-devtools__history {
  color: #9aa8a1;
  font-size: 12px;
}
.wmk-devtools__health {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(224, 234, 229, 0.12);
  background: rgba(255, 255, 255, 0.035);
}
.wmk-devtools__health-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
}
.wmk-devtools__health-title {
  color: #f7faf8;
  font-weight: 800;
}
.wmk-devtools__health-summary {
  color: #c4d0c9;
  font-size: 12px;
}
.wmk-devtools__badge {
  border: 1px solid rgba(224, 234, 229, 0.18);
  padding: 3px 7px;
  color: #f7faf8;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}
.wmk-devtools__badge--ready {
  border-color: rgba(30, 159, 114, 0.42);
  background: rgba(30, 159, 114, 0.12);
  color: #50d7a1;
}
.wmk-devtools__badge--warning {
  border-color: rgba(232, 190, 83, 0.48);
  background: rgba(232, 190, 83, 0.12);
  color: #f2cc6b;
}
.wmk-devtools__badge--error {
  border-color: rgba(243, 154, 141, 0.48);
  background: rgba(243, 154, 141, 0.12);
  color: #f6aca2;
}
.wmk-devtools__tool-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.wmk-devtools__tool-badge {
  width: max-content;
  border: 1px solid rgba(224, 234, 229, 0.18);
  padding: 3px 7px;
  color: #c4d0c9;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}
.wmk-devtools__tool-badge--readonly {
  border-color: rgba(80, 215, 161, 0.42);
  background: rgba(80, 215, 161, 0.1);
  color: #50d7a1;
}
.wmk-devtools__diagnostics {
  display: grid;
  gap: 8px;
}
.wmk-devtools__diagnostic {
  display: grid;
  gap: 3px;
  border-left: 3px solid rgba(224, 234, 229, 0.22);
  padding: 2px 0 2px 9px;
  color: #c4d0c9;
  font-size: 12px;
}
.wmk-devtools__diagnostic--warning {
  border-left-color: #e8be53;
}
.wmk-devtools__diagnostic--error {
  border-left-color: #f39a8d;
}
.wmk-devtools__diagnostic strong {
  color: #f7faf8;
}
.wmk-devtools__diagnostic span {
  color: #9aa8a1;
}
.wmk-devtools__title {
  margin: 3px 0 0;
  color: #f7faf8;
  font-size: 20px;
  font-weight: 800;
  line-height: 1.15;
}
.wmk-devtools__status {
  color: #50d7a1;
  font-size: 12px;
  font-weight: 800;
  text-align: right;
}
.wmk-devtools__tool {
  display: grid;
  gap: 10px;
  padding: 13px;
  border: 1px solid rgba(224, 234, 229, 0.12);
  background: rgba(255, 255, 255, 0.035);
}
.wmk-devtools__tool strong {
  color: #f7faf8;
  font-weight: 800;
}
.wmk-devtools__tool p {
  margin: 0;
  color: #c4d0c9;
  line-height: 1.35;
}
.wmk-devtools__tool textarea {
  min-height: 76px;
  width: 100%;
  resize: vertical;
  border: 1px solid rgba(224, 234, 229, 0.16);
  background: #f6f4ee;
  color: #101815;
  padding: 10px;
}
.wmk-devtools__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.wmk-devtools__actions button {
  border: 1px solid rgba(224, 234, 229, 0.16);
  background: rgba(255, 255, 255, 0.055);
  color: #f7faf8;
  padding: 8px 10px;
  cursor: pointer;
}
.wmk-devtools__actions button:first-child {
  border-color: #1e9f72;
  background: #1e9f72;
  color: #06100c;
  font-weight: 800;
}
.wmk-devtools__warning {
  border-left: 3px solid #e8be53;
  padding-left: 8px;
}
.wmk-devtools__error {
  color: #f39a8d;
  font-size: 12px;
}
.wmk-devtools__quality {
  color: #50d7a1;
  font-size: 12px;
  font-weight: 800;
}
.wmk-devtools__preview summary {
  cursor: pointer;
  color: #9aa8a1;
}
.wmk-devtools__preview pre,
.wmk-devtools__history pre {
  overflow: auto;
  margin: 6px 0 0;
  padding: 10px;
  background: rgba(0, 0, 0, 0.24);
  color: #e9f0ec;
  white-space: pre-wrap;
}
.wmk-devtools__history {
  display: grid;
  gap: 10px;
  border-top: 1px solid rgba(224, 234, 229, 0.12);
  padding-top: 12px;
}
.wmk-devtools__history-item {
  display: grid;
  gap: 6px;
}
.wmk-devtools__history-item button {
  justify-self: start;
}
`

export function mountDevtoolsOverlay(options: MountDevtoolsOptions = {}): DevtoolsOverlay {
  const root = document.createElement('section')
  root.className =
    options.placement === 'inline' ? 'wmk-devtools wmk-devtools--inline' : 'wmk-devtools'
  root.setAttribute('aria-label', 'WebMCP Kit devtools')

  const style = document.createElement('style')
  style.textContent = overlayStyles

  const target = options.container ?? document.body
  target.append(style, root)

  let open = options.initiallyOpen ?? true
  let nextHistoryId = 1
  const history: HistoryItem[] = []
  const pendingInvocations = new Map<string, ToolInvocation>()

  const unsubscribe = subscribeWebMCPKitEvents(function handleEvent(event) {
    if (event.type === 'invoked') {
      const invocation = event.detail as ToolInvocation
      if (invocation.id) {
        pendingInvocations.set(invocation.id, invocation)
      }
      return
    }

    if (event.type === 'succeeded' || event.type === 'failed' || event.type === 'blocked') {
      const result = event.detail as ToolInvocationResult | undefined
      const invocation = result?.invocationId
        ? pendingInvocations.get(result.invocationId)
        : undefined
      history.unshift(toHistoryItem(nextHistoryId, event, invocation))
      nextHistoryId += 1
      if (result?.invocationId) {
        pendingInvocations.delete(result.invocationId)
      }
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
      const textarea = root.querySelector<HTMLTextAreaElement>(
        `textarea[data-tool-name="${targetElement.dataset.toolName}"]`
      )
      const registration = listTools().find(
        (item) => item.tool.name === targetElement.dataset.toolName
      )
      if (textarea && registration) {
        textarea.value = JSON.stringify(createSampleInput(registration.tool.inputSchema), null, 2)
      }
      return
    }

    if (action === 'invoke') {
      void invokeFromOverlay(String(targetElement.dataset.toolName))
      return
    }

    if (action === 'replay') {
      const historyItem = history.find(
        (item) => String(item.id) === targetElement.dataset.historyId
      )
      if (historyItem) {
        void invokeFromOverlay(historyItem.toolName, historyItem.input)
      }
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
    const healthReport = getIntegrationHealthReport()
    root.innerHTML = `
      <button class="wmk-devtools__toggle" type="button" data-action="toggle">
        ${open ? 'Hide inspector' : 'Show inspector'} · ${registrations.length} tools
      </button>
      <div class="wmk-devtools__panel" ${open ? '' : 'hidden'}>
        <header class="wmk-devtools__header">
          <div>
            <div class="wmk-devtools__eyebrow">WebMCP Kit</div>
            <h2 class="wmk-devtools__title">Tool Inspector</h2>
          </div>
          <div class="wmk-devtools__status">${escapeHtml(getSupportLabel())}</div>
        </header>
        <section class="wmk-devtools__health" aria-label="Integration health">
          <div class="wmk-devtools__health-header">
            <div>
              <div class="wmk-devtools__health-title">Integration health</div>
              <div class="wmk-devtools__health-summary">${escapeHtml(healthReport.summary)}</div>
            </div>
            <span class="wmk-devtools__badge wmk-devtools__badge--${escapeAttribute(healthReport.status)}">${escapeHtml(healthReport.status)}</span>
          </div>
          ${
            healthReport.diagnostics.length === 0
              ? '<div class="wmk-devtools__health-summary">No integration issues found.</div>'
              : `
            <div class="wmk-devtools__diagnostics">
              ${healthReport.diagnostics.slice(0, 6).map(formatDiagnostic).join('')}
            </div>
          `
          }
        </section>
        ${registrations
          .map(
            (registration) => `
          <article class="wmk-devtools__tool">
            <div class="wmk-devtools__meta">${escapeHtml(registration.mode)}</div>
            <div class="wmk-devtools__tool-badges">${formatToolBadges(registration.tool)}</div>
            <strong>${escapeHtml(registration.tool.name)}</strong>
            <p>${escapeHtml(registration.tool.description)}</p>
            <div class="wmk-devtools__quality">Quality ${getQualityScore(registration.warnings)}% · ${registration.warnings.length} warnings</div>
            ${registration.warnings.map((warning) => `<div class="wmk-devtools__warning">${escapeHtml(warning)}</div>`).join('')}
            <details class="wmk-devtools__preview">
              <summary>Prompt preview</summary>
              <pre>${escapeHtml(createPromptPreview(registration.tool.name, registration.tool.description, registration.tool.inputSchema))}</pre>
            </details>
            <textarea data-tool-name="${escapeAttribute(registration.tool.name)}">${escapeHtml(JSON.stringify(createSampleInput(registration.tool.inputSchema), null, 2))}</textarea>
            <div class="wmk-devtools__actions">
              <button type="button" data-action="invoke" data-tool-name="${escapeAttribute(registration.tool.name)}">Invoke</button>
              <button type="button" data-action="sample" data-tool-name="${escapeAttribute(registration.tool.name)}">Sample</button>
            </div>
          </article>
        `
          )
          .join('')}
        <div class="wmk-devtools__history">
          <strong>Invocation history</strong>
          ${
            history.length === 0
              ? '<span>No invocations yet.</span>'
              : history
                  .map(
                    (item) => `
            <article class="wmk-devtools__history-item">
              <span>${escapeHtml(item.toolName)} - ${escapeHtml(item.status)} - ${escapeHtml(item.detail)}${item.durationMs === undefined ? '' : ` - ${item.durationMs}ms`}</span>
              <pre>${escapeHtml(JSON.stringify({ input: item.input, output: item.output }, null, 2))}</pre>
              <button type="button" data-action="replay" data-history-id="${item.id}">Replay</button>
            </article>
          `
                  )
                  .join('')
          }
        </div>
      </div>
    `
  }

  async function invokeFromOverlay(toolName: string, replayInput?: Record<string, unknown>) {
    const textarea = root.querySelector<HTMLTextAreaElement>(
      `textarea[data-tool-name="${toolName}"]`
    )
    const parsedInput = replayInput
      ? ({ ok: true, input: replayInput } as const)
      : parseInput(toolName, textarea?.value ?? '')
    if (!parsedInput.ok) return

    const invocationId = createInvocationId()

    const invocation = {
      id: invocationId,
      toolName,
      input: parsedInput.input,
      source: 'devtools'
    } satisfies ToolInvocation
    await invokeTool(invocation)
  }

  function parseInput(
    toolName: string,
    value: string
  ): { ok: true; input: Record<string, unknown> } | { ok: false } {
    if (!value.trim()) {
      return {
        ok: true,
        input: {}
      }
    }

    try {
      const input = JSON.parse(value) as unknown
      if (input && typeof input === 'object' && !Array.isArray(input)) {
        return {
          ok: true,
          input: input as Record<string, unknown>
        }
      }
    } catch {
      addLocalHistoryError(toolName, 'Input must be valid JSON.')
      return {
        ok: false
      }
    }

    addLocalHistoryError(toolName, 'Input must be a JSON object.')
    return {
      ok: false
    }
  }

  function addLocalHistoryError(toolName: string, detail: string): void {
    history.unshift({
      id: nextHistoryId,
      toolName,
      status: 'error',
      input: {},
      detail
    })
    nextHistoryId += 1
    history.splice(5)
    render()
  }
}

function createInvocationId(): string {
  return `devtools_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function getQualityScore(warnings: string[]): number {
  return Math.max(0, 100 - warnings.length * 20)
}

function createPromptPreview(name: string, description: string, inputSchema: JsonSchema): string {
  return [
    `Tool: ${name}`,
    `When to use: ${description}`,
    `Input JSON Schema: ${JSON.stringify(inputSchema, null, 2)}`
  ].join('\n\n')
}

function formatToolBadges(tool: WebMCPTool): string {
  if (tool.annotations?.readOnlyHint !== true) return ''

  return `
    <span class="wmk-devtools__tool-badge wmk-devtools__tool-badge--readonly">
      Read-only
    </span>
  `
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

function formatDiagnostic(diagnostic: IntegrationDiagnostic): string {
  return `
    <article class="wmk-devtools__diagnostic wmk-devtools__diagnostic--${escapeAttribute(diagnostic.severity)}">
      <strong>${escapeHtml(diagnostic.title)}</strong>
      <span>${escapeHtml(diagnostic.detail)}</span>
      <span>${escapeHtml(diagnostic.action)}</span>
    </article>
  `
}

function toHistoryItem(
  id: number,
  event: WebMCPKitEvent,
  invocation?: ToolInvocation
): HistoryItem {
  const result = event.detail as ToolInvocationResult | undefined

  return {
    id,
    toolName: event.toolName,
    status: result?.status ?? (event.type === 'succeeded' ? 'success' : 'error'),
    input: invocation?.input ?? {},
    output: result?.output,
    durationMs: result?.durationMs,
    detail: result?.error ?? 'Completed'
  }
}
