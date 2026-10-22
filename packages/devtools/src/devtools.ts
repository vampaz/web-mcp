import { escapeHtml, escapeAttribute } from '../../core/src/command-input-html'
import {
  getErrorMessage,
  getIntegrationHealthReport,
  getSupportLabel,
  invokeTool,
  listTools,
  subscribeWebMCPKitEvents,
  type ConfirmationEventDetail,
  type IntegrationDiagnostic,
  type IntegrationHealthReport,
  type JsonSchema,
  type RegisteredTool,
  type ToolContext,
  type ToolInvocation,
  type ToolInvocationResult,
  type WebMCPKitEvent,
  type WebMCPTool
} from '@vampaz/webmcp-kit'

export interface DevtoolsOverlay {
  refresh: () => void
  destroy: () => void
}

/**
 * The overlay renders in its own shadow root. Set `--wmk-devtools-accent` on any ancestor
 * (for example `:root`) to change its accent colour.
 */
export interface MountDevtoolsOptions {
  container?: HTMLElement
  initiallyOpen?: boolean
  placement?: 'fixed' | 'inline'
  /** Corner for fixed placement, in logical (writing-direction aware) terms. Default `bottom-end`. */
  position?: 'bottom-end' | 'bottom-start' | 'top-end' | 'top-start'
}

type ConfirmationOutcome = 'requested' | 'approved' | 'denied'

interface HistoryItem {
  id: number
  toolName: string
  status: ToolInvocationResult['status']
  code?: ToolInvocationResult['code']
  input: Record<string, unknown>
  output?: unknown
  durationMs?: number
  detail: string
  timestamp: number
  source?: ToolContext['source']
  confirmation?: ConfirmationOutcome
}

interface PendingInvocation {
  input?: Record<string, unknown>
  source?: ToolContext['source']
  confirmation?: ConfirmationOutcome
}

interface InvokedEventDetail {
  id?: string
  input?: Record<string, unknown>
  source?: ToolContext['source']
}

interface ToolView {
  article: HTMLElement
  error: HTMLElement
  meta: HTMLElement
  metaKey: string
  mode: HTMLElement
  registration: RegisteredTool
  searchText: string
  status: HTMLElement
  textarea: HTMLTextAreaElement
}

const historyLimit = 50
const panelId = 'wmk-devtools-panel'

const overlayStyles = `
[hidden] {
  display: none !important;
}
.wmk-devtools {
  --wmk-devtools-accent-base: var(--wmk-devtools-accent, #2458ff);
  --wmk-devtools-accent-hover: color-mix(in srgb, var(--wmk-devtools-accent-base) 82%, white);
  --wmk-devtools-accent-soft: color-mix(in srgb, var(--wmk-devtools-accent-base) 14%, transparent);
  --wmk-devtools-accent-rule: color-mix(in srgb, var(--wmk-devtools-accent-base) 42%, transparent);
  --wmk-devtools-accent-text: color-mix(in srgb, var(--wmk-devtools-accent-base) 58%, white);
  --wmk-devtools-edge-offset: 18px;
  --wmk-devtools-width: min(460px, calc(100% - 36px));
  --wmk-devtools-panel-max-height: min(720px, calc(100svh - 96px));
  --wmk-devtools-inline-panel-max-height: none;
  position: fixed;
  inset-block-end: var(--wmk-devtools-edge-offset);
  inset-inline-end: var(--wmk-devtools-edge-offset);
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  align-items: end;
  gap: 12px;
  inline-size: var(--wmk-devtools-width);
  color: #f7faf8;
  font: 500 14px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.wmk-devtools:not(.wmk-devtools--inline, [data-open]) {
  inline-size: auto;
}
.wmk-devtools[data-position$="-start"] {
  inset-inline-start: var(--wmk-devtools-edge-offset);
  inset-inline-end: auto;
  align-items: start;
}
.wmk-devtools[data-position^="top-"] {
  inset-block-start: var(--wmk-devtools-edge-offset);
  inset-block-end: auto;
}
.wmk-devtools--inline {
  position: static;
  align-items: stretch;
  gap: 0;
  inline-size: 100%;
}
.wmk-devtools button,
.wmk-devtools input,
.wmk-devtools textarea {
  font: inherit;
}
.wmk-devtools input,
.wmk-devtools textarea {
  font-size: 1rem;
}
.wmk-devtools button:focus-visible,
.wmk-devtools input:focus-visible,
.wmk-devtools textarea:focus-visible,
.wmk-devtools summary:focus-visible {
  outline: 2px solid var(--wmk-devtools-accent-text);
  outline-offset: 2px;
}
.wmk-devtools__toggle {
  border: 1px solid var(--wmk-devtools-accent-base);
  background: var(--wmk-devtools-accent-base);
  color: #ffffff;
  padding: 10px 14px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.26);
  transition: background 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
}
.wmk-devtools__toggle:hover {
  border-color: var(--wmk-devtools-accent-hover);
  background: var(--wmk-devtools-accent-hover);
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.34);
}
.wmk-devtools--inline .wmk-devtools__toggle {
  width: 100%;
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
  display: grid;
  align-self: stretch;
  gap: 12px;
  max-height: var(--wmk-devtools-panel-max-height);
  overflow: auto;
  padding: 14px;
  border: 1px solid rgba(224, 234, 229, 0.14);
  background: rgba(9, 17, 14, 0.96);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(18px);
}
.wmk-devtools--inline .wmk-devtools__panel {
  max-height: var(--wmk-devtools-inline-panel-max-height);
  border: 0;
  border-radius: 0;
  box-shadow: none;
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
  border-color: var(--wmk-devtools-accent-rule);
  background: var(--wmk-devtools-accent-soft);
  color: var(--wmk-devtools-accent-text);
}
.wmk-devtools__badge--warning {
  border-color: var(--wmk-devtools-accent-rule);
  background: var(--wmk-devtools-accent-soft);
  color: var(--wmk-devtools-accent-text);
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
  border-color: var(--wmk-devtools-accent-rule);
  background: var(--wmk-devtools-accent-soft);
  color: var(--wmk-devtools-accent-text);
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
  border-left-color: var(--wmk-devtools-accent-text);
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
  color: var(--wmk-devtools-accent-text);
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
.wmk-devtools__tool textarea[aria-invalid="true"] {
  border-color: #f39a8d;
  box-shadow: 0 0 0 2px rgba(243, 154, 141, 0.32);
}
.wmk-devtools__filter {
  display: grid;
  gap: 4px;
  color: #9aa8a1;
  font-size: 12px;
}
.wmk-devtools__filter input {
  min-height: 36px;
  border: 1px solid rgba(224, 234, 229, 0.16);
  background: rgba(255, 255, 255, 0.055);
  color: #f7faf8;
  padding: 6px 10px;
}
.wmk-devtools__tools {
  display: grid;
  gap: 12px;
}
.wmk-devtools__schema {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  color: #c4d0c9;
  font-size: 12px;
}
.wmk-devtools__schema li {
  border: 1px solid rgba(224, 234, 229, 0.14);
  padding: 2px 6px;
  overflow-wrap: anywhere;
}
.wmk-devtools__schema code {
  color: #f7faf8;
}
.wmk-devtools__schema em {
  color: var(--wmk-devtools-accent-text);
  font-style: normal;
  font-weight: 800;
}
.wmk-devtools__tool-status {
  margin: 0;
  color: #9aa8a1;
  font-size: 12px;
}
.wmk-devtools__tool[data-busy] .wmk-devtools__tool-status {
  color: var(--wmk-devtools-accent-text);
}
.wmk-devtools__history-meta {
  color: #9aa8a1;
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
  border-color: var(--wmk-devtools-accent-base);
  background: var(--wmk-devtools-accent-base);
  color: #ffffff;
  font-weight: 800;
}
.wmk-devtools__warning {
  border-left: 3px solid var(--wmk-devtools-accent-text);
  padding-left: 8px;
}
.wmk-devtools__guidance {
  display: grid;
  gap: 6px;
  border: 1px solid rgba(224, 234, 229, 0.12);
  background: rgba(0, 0, 0, 0.16);
  padding: 10px;
}
.wmk-devtools__guidance strong {
  color: #f7faf8;
  font-size: 12px;
}
.wmk-devtools__guidance ul {
  display: grid;
  gap: 5px;
  margin: 0;
  padding-left: 16px;
  color: #c4d0c9;
  font-size: 12px;
}
.wmk-devtools__error {
  margin: 0;
  color: #f39a8d;
  font-size: 12px;
}
.wmk-devtools__quality {
  color: var(--wmk-devtools-accent-text);
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
.wmk-devtools__history-list {
  display: grid;
  gap: 10px;
}
.wmk-devtools__history-item {
  display: grid;
  gap: 6px;
}
.wmk-devtools__history-item button {
  justify-self: start;
}
@media (max-width: 48rem) {
  .wmk-devtools {
    --wmk-devtools-edge-offset: 8px;
    --wmk-devtools-width: calc(100% - 16px);
    --wmk-devtools-panel-max-height: min(34rem, calc(100svh - 5rem));
    --wmk-devtools-inline-panel-max-height: min(24rem, calc(100svh - 19rem));
  }

  .wmk-devtools__panel {
    gap: 10px;
    padding: 10px;
  }

  .wmk-devtools--inline .wmk-devtools__panel {
    overflow: auto;
  }

  .wmk-devtools__header,
  .wmk-devtools__health-header {
    display: grid;
    gap: 8px;
  }

  .wmk-devtools__status {
    text-align: left;
  }

  .wmk-devtools__tool {
    padding: 10px;
  }

  .wmk-devtools__tool-badge {
    width: auto;
    max-width: 100%;
    overflow-wrap: anywhere;
  }

  .wmk-devtools__actions button,
  .wmk-devtools__history-item button {
    min-height: 40px;
  }
}
`

export function mountDevtoolsOverlay(options: MountDevtoolsOptions = {}): DevtoolsOverlay {
  const host = document.createElement('div')
  host.className = 'wmk-devtools-host'
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = overlayStyles
  const root = createElement(`
    <section class="wmk-devtools" aria-label="WebMCP Kit devtools">
      <button class="wmk-devtools__toggle" type="button" data-action="toggle" aria-controls="${panelId}"></button>
      <div class="wmk-devtools__panel" id="${panelId}">
        <header class="wmk-devtools__header">
          <div>
            <div class="wmk-devtools__eyebrow">WebMCP Kit</div>
            <h2 class="wmk-devtools__title">Tool Inspector</h2>
          </div>
          <div class="wmk-devtools__status" data-support></div>
        </header>
        <section class="wmk-devtools__health" aria-label="Integration health"></section>
        <label class="wmk-devtools__filter">
          <span>Filter tools</span>
          <input type="search" data-filter autocomplete="off" spellcheck="false" />
        </label>
        <div class="wmk-devtools__tools"></div>
        <p class="wmk-devtools__meta" data-filter-empty hidden>No tools match the filter.</p>
        <section class="wmk-devtools__history" aria-label="Invocation history">
          <strong>Invocation history</strong>
          <span data-history-empty>No invocations yet.</span>
          <div class="wmk-devtools__history-list"></div>
        </section>
      </div>
    </section>
  `)
  if (options.placement === 'inline') root.classList.add('wmk-devtools--inline')
  root.dataset.position = options.position ?? 'bottom-end'
  shadow.append(style, root)

  const toggle = query<HTMLButtonElement>(root, '.wmk-devtools__toggle')
  const panel = query<HTMLElement>(root, '.wmk-devtools__panel')
  const support = query<HTMLElement>(root, '[data-support]')
  const health = query<HTMLElement>(root, '.wmk-devtools__health')
  const filter = query<HTMLInputElement>(root, '[data-filter]')
  const tools = query<HTMLElement>(root, '.wmk-devtools__tools')
  const filterEmpty = query<HTMLElement>(root, '[data-filter-empty]')
  const historyEmpty = query<HTMLElement>(root, '[data-history-empty]')
  const historyList = query<HTMLElement>(root, '.wmk-devtools__history-list')

  const target = options.container ?? document.body
  target.append(host)

  let open = options.initiallyOpen ?? true
  let renderPending = false
  let destroyed = false
  let nextHistoryId = 1
  let nextToolViewId = 1
  const history: HistoryItem[] = []
  const historyViews = new Map<number, HTMLElement>()
  const toolViews = new Map<string, ToolView>()
  const pendingInvocations = new Map<string, PendingInvocation>()
  const draftInputs = new Map<string, string>()
  const busyCounts = new Map<string, number>()
  const toolStatuses = new Map<string, string>()

  const unsubscribe = subscribeWebMCPKitEvents(function handleEvent(event) {
    if (event.type === 'invoked') {
      const invocation = event.detail as InvokedEventDetail | undefined
      if (invocation?.id) {
        pendingInvocations.set(invocation.id, {
          input: invocation.input,
          source: invocation.source
        })
      }
      return
    }

    if (event.type === 'confirmation-requested' || event.type === 'confirmation-settled') {
      const confirmation = event.detail as ConfirmationEventDetail | undefined
      const pending = confirmation ? pendingInvocations.get(confirmation.id) : undefined
      if (pending && confirmation)
        pending.confirmation = getConfirmationOutcome(event.type, confirmation)
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
      history.splice(historyLimit)
    }
    scheduleRender()
  })

  root.addEventListener('click', function handleClick(event) {
    const targetElement = event.target
    if (!(targetElement instanceof HTMLElement)) return
    const button = targetElement.closest<HTMLElement>('[data-action]')
    if (!button) return

    const action = button.dataset.action
    const toolName = button.dataset.toolName ?? ''
    if (action === 'toggle') {
      open = !open
      render()
      return
    }

    if (action === 'sample') {
      const view = toolViews.get(toolName)
      if (view) {
        const sampleInput = JSON.stringify(
          createSampleInput(view.registration.tool.inputSchema),
          null,
          2
        )
        view.textarea.value = sampleInput
        draftInputs.set(toolName, sampleInput)
        setInputError(view, undefined)
      }
      return
    }

    if (action === 'invoke') {
      void invokeFromOverlay(toolName)
      return
    }

    if (action === 'copy') {
      void copyAsCode(toolName)
      return
    }

    if (action === 'replay') {
      const historyItem = history.find((item) => String(item.id) === button.dataset.historyId)
      if (historyItem) {
        void invokeFromOverlay(historyItem.toolName, historyItem.input)
      }
    }
  })

  root.addEventListener('input', function handleInput(event) {
    const targetElement = event.target
    if (targetElement === filter) {
      applyFilter()
      return
    }
    if (!(targetElement instanceof HTMLTextAreaElement)) return
    const toolName = targetElement.dataset.toolName
    if (!toolName) return

    draftInputs.set(toolName, targetElement.value)
    const view = toolViews.get(toolName)
    if (view) setInputError(view, undefined)
  })

  render()

  return {
    refresh: render,
    destroy() {
      destroyed = true
      unsubscribe()
      host.remove()
    }
  }

  function scheduleRender() {
    if (renderPending) return
    renderPending = true
    queueMicrotask(function flushRender() {
      renderPending = false
      if (!destroyed) render()
    })
  }

  function render() {
    const registrations = listTools()
    toggle.textContent = `${open ? 'Hide inspector' : 'Show inspector'} · ${registrations.length} tools`
    toggle.setAttribute('aria-expanded', String(open))
    root.toggleAttribute('data-open', open)
    panel.hidden = !open
    if (!open) return

    support.textContent = getSupportLabel()
    renderHealth(getIntegrationHealthReport())
    renderTools(registrations)
    renderHistory()
  }

  function renderHealth(report: IntegrationHealthReport) {
    health.innerHTML = `
      <div class="wmk-devtools__health-header">
        <div>
          <div class="wmk-devtools__health-title">Integration health</div>
          <div class="wmk-devtools__health-summary">${escapeHtml(report.summary)}</div>
        </div>
        <span class="wmk-devtools__badge wmk-devtools__badge--${escapeAttribute(report.status)}">${escapeHtml(report.status)}</span>
      </div>
      ${
        report.diagnostics.length === 0
          ? '<div class="wmk-devtools__health-summary">No integration issues found.</div>'
          : `<div class="wmk-devtools__diagnostics">${report.diagnostics.slice(0, 6).map(formatDiagnostic).join('')}</div>`
      }
    `
  }

  // Tool articles are keyed by registration, so drafts, focus, open details, and scroll survive renders.
  function renderTools(registrations: RegisteredTool[]) {
    pruneDraftInputs(registrations)
    const registeredNames = new Set<string>()
    let previous: Element | null = null
    for (const registration of registrations) {
      const toolName = registration.tool.name
      registeredNames.add(toolName)
      let view = toolViews.get(toolName)
      if (view?.registration !== registration) {
        view?.article.remove()
        view = createToolView(registration)
        toolViews.set(toolName, view)
      } else updateRegistrationMeta(view)
      const expected: Element | null = previous
        ? previous.nextElementSibling
        : tools.firstElementChild
      if (expected !== view.article) tools.insertBefore(view.article, expected)
      previous = view.article
    }
    for (const [toolName, view] of toolViews) {
      if (registeredNames.has(toolName)) continue
      view.article.remove()
      toolViews.delete(toolName)
      toolStatuses.delete(toolName)
    }
    applyFilter()
  }

  function createToolView(registration: RegisteredTool): ToolView {
    const tool = registration.tool
    const id = `wmk-tool-${nextToolViewId}`
    nextToolViewId += 1
    const name = escapeAttribute(tool.name)
    const article = createElement(`
      <article class="wmk-devtools__tool">
        <div class="wmk-devtools__meta" data-mode>${escapeHtml(registration.mode)}</div>
        <div class="wmk-devtools__tool-badges">${formatToolBadges(tool)}</div>
        <strong>${escapeHtml(tool.name)}</strong>
        <p>${escapeHtml(tool.description)}</p>
        <div data-registration-meta>${formatRegistrationMeta(registration)}</div>
        <details class="wmk-devtools__preview">
          <summary>Prompt preview</summary>
          <pre>${escapeHtml(createPromptPreview(tool.name, tool.description, tool.inputSchema))}</pre>
        </details>
        ${formatSchemaHints(tool.inputSchema, `${id}-schema`)}
        <textarea aria-label="${name} input JSON" aria-describedby="${id}-schema ${id}-error" data-tool-name="${name}"></textarea>
        <p class="wmk-devtools__error" id="${id}-error" data-input-error hidden></p>
        <div class="wmk-devtools__actions">
          <button type="button" data-action="invoke" data-tool-name="${name}">Invoke</button>
          <button type="button" data-action="sample" data-tool-name="${name}">Sample</button>
          <button type="button" data-action="copy" data-tool-name="${name}">Copy as code</button>
        </div>
        <p class="wmk-devtools__tool-status" role="status" data-tool-status></p>
      </article>
    `)
    const view: ToolView = {
      article,
      error: query(article, '[data-input-error]'),
      meta: query(article, '[data-registration-meta]'),
      metaKey: registrationMetaKey(registration),
      mode: query(article, '[data-mode]'),
      registration,
      searchText: `${tool.name}\n${tool.description}`.toLowerCase(),
      status: query(article, '[data-tool-status]'),
      textarea: query(article, 'textarea')
    }
    view.textarea.value = getDraftInput(tool)
    applyToolStatus(tool.name, view)
    return view
  }

  // Native registration can fail after mounting and change mode and warnings in place;
  // refresh that metadata without replacing the draft-bearing controls.
  function updateRegistrationMeta(view: ToolView) {
    const key = registrationMetaKey(view.registration)
    if (key === view.metaKey) return
    view.metaKey = key
    view.mode.textContent = view.registration.mode
    view.meta.innerHTML = formatRegistrationMeta(view.registration)
  }

  function applyFilter() {
    const filterText = filter.value.trim().toLowerCase()
    let visible = 0
    for (const view of toolViews.values()) {
      const matches = !filterText || view.searchText.includes(filterText)
      view.article.hidden = !matches
      if (matches) visible += 1
    }
    filterEmpty.hidden = visible > 0 || toolViews.size === 0
  }

  function renderHistory() {
    historyEmpty.hidden = history.length > 0
    const currentIds = new Set(
      history.map(function id(item) {
        return item.id
      })
    )
    for (const [id, element] of historyViews) {
      if (currentIds.has(id)) continue
      element.remove()
      historyViews.delete(id)
    }
    let previous: Element | null = null
    for (const item of history) {
      let element = historyViews.get(item.id)
      if (!element) {
        element = createElement(formatHistoryItem(item))
        historyViews.set(item.id, element)
      }
      const expected: Element | null = previous
        ? previous.nextElementSibling
        : historyList.firstElementChild
      if (expected !== element) historyList.insertBefore(element, expected)
      previous = element
    }
  }

  async function invokeFromOverlay(toolName: string, replayInput?: Record<string, unknown>) {
    const input = replayInput ?? readToolInput(toolName)
    if (!input) return

    const invocation = {
      id: createInvocationId(),
      toolName,
      input,
      source: 'devtools'
    } satisfies ToolInvocation
    setBusy(toolName, 1)
    try {
      const result = await invokeTool(invocation)
      toolStatuses.set(toolName, formatLastCall(result))
    } catch (error) {
      toolStatuses.set(toolName, `Last call failed: ${getErrorMessage(error)}`)
    } finally {
      setBusy(toolName, -1)
    }
  }

  async function copyAsCode(toolName: string) {
    const input = readToolInput(toolName)
    if (!input) return
    try {
      if (!navigator.clipboard) throw new Error('Clipboard access is unavailable.')
      await navigator.clipboard.writeText(createInvokeSnippet(toolName, input))
      toolStatuses.set(toolName, 'Copied the invokeTool() snippet.')
    } catch (error) {
      toolStatuses.set(toolName, `Copy failed: ${getErrorMessage(error)}`)
    }
    applyToolStatus(toolName, toolViews.get(toolName))
  }

  function readToolInput(toolName: string): Record<string, unknown> | undefined {
    const view = toolViews.get(toolName)
    if (!view) return undefined
    draftInputs.set(toolName, view.textarea.value)
    const parsed = parseInput(view.textarea.value)
    setInputError(view, parsed.ok ? undefined : parsed.error)
    return parsed.ok ? parsed.input : undefined
  }

  function setInputError(view: ToolView, error: string | undefined) {
    view.error.textContent = error ?? ''
    view.error.hidden = !error
    if (error) view.textarea.setAttribute('aria-invalid', 'true')
    else view.textarea.removeAttribute('aria-invalid')
  }

  function setBusy(toolName: string, delta: number) {
    const count = Math.max(0, (busyCounts.get(toolName) ?? 0) + delta)
    if (count > 0) busyCounts.set(toolName, count)
    else busyCounts.delete(toolName)
    applyToolStatus(toolName, toolViews.get(toolName))
  }

  function applyToolStatus(toolName: string, view: ToolView | undefined) {
    if (!view) return
    const running = busyCounts.get(toolName) ?? 0
    view.article.toggleAttribute('data-busy', running > 0)
    view.status.textContent =
      running > 0
        ? `Invoking… ${running} call${running === 1 ? '' : 's'} running.`
        : (toolStatuses.get(toolName) ?? '')
  }

  function getDraftInput(tool: WebMCPTool): string {
    return (
      draftInputs.get(tool.name) ?? JSON.stringify(createSampleInput(tool.inputSchema), null, 2)
    )
  }

  function pruneDraftInputs(registrations: RegisteredTool[]): void {
    const registeredToolNames = new Set(
      registrations.map(function mapRegistration(registration) {
        return registration.tool.name
      })
    )
    for (const toolName of draftInputs.keys()) {
      if (!registeredToolNames.has(toolName)) draftInputs.delete(toolName)
    }
  }
}

function parseInput(
  value: string
): { ok: true; input: Record<string, unknown> } | { ok: false; error: string } {
  if (!value.trim()) return { ok: true, input: {} }

  let input: unknown
  try {
    input = JSON.parse(value)
  } catch (error) {
    return { ok: false, error: `Input must be valid JSON. ${getErrorMessage(error)}` }
  }
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return { ok: true, input: input as Record<string, unknown> }
  }
  return { ok: false, error: 'Input must be a JSON object.' }
}

function getConfirmationOutcome(
  type: 'confirmation-requested' | 'confirmation-settled',
  detail: ConfirmationEventDetail
): ConfirmationOutcome {
  if (type === 'confirmation-requested') return 'requested'
  return detail.approved ? 'approved' : 'denied'
}

function formatLastCall(result: ToolInvocationResult): string {
  const code = result.code ? ` (${result.code})` : ''
  return `Last call: ${result.status}${code} in ${Math.round(result.durationMs)}ms.`
}

function createInvokeSnippet(toolName: string, input: Record<string, unknown>): string {
  const inputJson = JSON.stringify(input, null, 2).replaceAll('\n', '\n  ')
  return `await invokeTool({\n  toolName: ${JSON.stringify(toolName)},\n  input: ${inputJson}\n})`
}

function formatSchemaHints(schema: JsonSchema, id: string): string {
  const properties = Object.entries(schema.properties ?? {})
  if (properties.length === 0) {
    return `<p class="wmk-devtools__meta" id="${escapeAttribute(id)}">No input fields.</p>`
  }
  const required = new Set(schema.required ?? [])
  return `
    <ul class="wmk-devtools__schema" id="${escapeAttribute(id)}" aria-label="Input fields">
      ${properties
        .map(function formatProperty([name, property]) {
          return `<li><code>${escapeHtml(name)}</code> ${escapeHtml(describeSchemaType(property))}${required.has(name) ? ' <em>required</em>' : ''}</li>`
        })
        .join('')}
    </ul>
  `
}

function describeSchemaType(schema: JsonSchema): string {
  if (schema.enum?.length) {
    const values = schema.enum.slice(0, 5).map(function format(value) {
      return JSON.stringify(value)
    })
    return `${values.join(' | ')}${schema.enum.length > 5 ? ' | …' : ''}`
  }
  if (schema.const !== undefined) return JSON.stringify(schema.const)
  const type = typeof schema.type === 'string' ? schema.type : schema.type?.join(' | ')
  if (type === 'array' && schema.items) return `${describeSchemaType(schema.items)}[]`
  return type ?? 'any'
}

function formatHistoryItem(item: HistoryItem): string {
  const time = new Date(item.timestamp)
  const meta = [
    `<time datetime="${escapeAttribute(time.toISOString())}">${escapeHtml(time.toLocaleTimeString())}</time>`,
    item.source ? escapeHtml(item.source) : '',
    item.confirmation ? `confirmation ${escapeHtml(item.confirmation)}` : ''
  ].filter(Boolean)
  return `
    <article class="wmk-devtools__history-item">
      <span>${escapeHtml(item.toolName)} - ${escapeHtml(item.status)} - ${escapeHtml(item.detail)}${item.durationMs === undefined ? '' : ` - ${item.durationMs}ms`}</span>
      <span class="wmk-devtools__history-meta">${meta.join(' · ')}</span>
      <pre>${escapeHtml(formatHistoryData(item))}</pre>
      <button type="button" data-action="replay" data-history-id="${item.id}">Replay</button>
    </article>
  `
}

function createElement(markup: string): HTMLElement {
  const template = document.createElement('template')
  template.innerHTML = markup.trim()
  const element = template.content.firstElementChild
  if (!(element instanceof HTMLElement)) throw new Error('Devtools markup must create an element.')
  return element
}

function query<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector)
  if (!element) throw new Error(`Devtools markup is missing ${selector}.`)
  return element
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

function formatToolGuidance(tool: WebMCPTool, warnings: string[]): string {
  return `
    <section class="wmk-devtools__guidance" aria-label="Improve ${escapeAttribute(tool.name)}">
      <strong>Improve this tool</strong>
      <ul>
        ${getToolGuidance(tool, warnings)
          .map(function formatGuidanceItem(item) {
            return `<li>${escapeHtml(item)}</li>`
          })
          .join('')}
      </ul>
    </section>
  `
}

function getToolGuidance(tool: WebMCPTool, warnings: string[]): string[] {
  const guidance: string[] = []
  const schema = tool.inputSchema

  if (warnings.length > 0) {
    guidance.push('Fix registration warnings first; they directly affect resolver reliability.')
  }

  if (schema.type !== 'object') {
    guidance.push('Use an object input schema so every tool call has named parameters.')
  } else if (schema.additionalProperties !== false) {
    guidance.push('Set additionalProperties: false to keep model-generated input predictable.')
  }

  if (schema.type === 'object' && Object.keys(schema.properties ?? {}).length > 0) {
    if ((schema.required ?? []).length === 0) {
      guidance.push('Mark required fields explicitly so missing input is blocked early.')
    }
  }

  if (isMutationTool(tool) && tool.confirmation === undefined) {
    guidance.push('Require confirmation for this mutating action before exposing it to resolvers.')
  }

  if (!tool.examples?.length) {
    guidance.push('Add one realistic example input for demos, evals, and resolver prompts.')
  }

  if (!tool.outputSchema) {
    guidance.push('Add outputSchema when the result feeds another tool, test, or UI assertion.')
  }

  if (guidance.length === 0) {
    return ['Looks ready; add a Playwright or eval case for the workflow users will try first.']
  }

  return guidance.slice(0, 4)
}

function isMutationTool(tool: WebMCPTool): boolean {
  if (tool.annotations?.readOnlyHint === true) return false

  return /(^|_)(add|approve|archive|cancel|charge|checkout|create|delete|export|pay|publish|remove|send|submit|update|void)(_|$)/.test(
    tool.name.toLowerCase()
  )
}

function createSampleInput(schema: JsonSchema): Record<string, unknown> {
  const sample: Record<string, unknown> = Object.create(null)

  for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
    sample[key] = createSampleValue(key, propertySchema)
  }

  return sample
}

function formatHistoryData(item: HistoryItem): string {
  try {
    return JSON.stringify({ input: item.input, output: item.output }, null, 2)
  } catch {
    return 'This tool result cannot be displayed as JSON.'
  }
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
  invocation?: PendingInvocation
): HistoryItem {
  const result = event.detail as ToolInvocationResult | undefined

  return {
    id,
    toolName: event.toolName,
    status: result?.status ?? (event.type === 'succeeded' ? 'success' : 'error'),
    code: result?.code,
    input: invocation?.input ?? {},
    output: result?.output,
    durationMs: result?.durationMs,
    detail: result?.error ?? 'Completed',
    timestamp: event.timestamp,
    source: invocation?.source,
    confirmation: invocation?.confirmation
  }
}

function formatRegistrationMeta(registration: RegisteredTool): string {
  const { tool, warnings } = registration
  return `
    <div class="wmk-devtools__quality">Quality ${getQualityScore(warnings)}% · ${warnings.length} warnings</div>
    ${warnings.map((warning) => `<div class="wmk-devtools__warning">${escapeHtml(warning)}</div>`).join('')}
    ${formatToolGuidance(tool, warnings)}
  `
}

function registrationMetaKey(registration: RegisteredTool): string {
  return JSON.stringify([registration.mode, registration.warnings])
}
