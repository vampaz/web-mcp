import { getStyles } from './command-input-styles'
import type { WebMCPCommandInputLabels, WebMCPCommandInputPhase } from './interfaces/command-input'

export type CommandInputTone = 'error' | 'info' | 'success'

export interface CommandInputSelectState {
  options: Array<{ label: string; value: string }>
  selected: string
}

export interface CommandInputViewState {
  buttonLabel: string
  diagnosticsOpen: boolean
  disabled: boolean
  floating: boolean
  floatingExpanded: boolean
  label: string
  labels: WebMCPCommandInputLabels
  launcher: boolean
  model?: CommandInputSelectState
  detail: string
  optionsStatus: string
  phase: WebMCPCommandInputPhase
  placeholder: string
  prompt: string
  provider?: CommandInputSelectState
  running: boolean
  settingsOpen: boolean
  showDiagnostics: boolean
  tone: CommandInputTone
}

export interface CommandInputDom {
  diagnostics: HTMLDetailsElement
  diagnosticsLabel: HTMLElement
  feedback: HTMLElement
  form: HTMLFormElement
  input: HTMLInputElement
  label: HTMLElement
  launcher: HTMLButtonElement
  model: HTMLSelectElement
  modelField: HTMLElement
  modelLabel: HTMLElement
  optionsLabel: HTMLElement
  panel: HTMLElement
  provider: HTMLSelectElement
  providerField: HTMLElement
  providerLabel: HTMLElement
  root: ShadowRoot
  run: HTMLButtonElement
  settings: HTMLDetailsElement
  settingsGrid: HTMLElement
  status: HTMLElement
}

const panelId = 'webmcp-command-panel'

// Static skeleton: every dynamic value is patched through DOM properties in applyCommandInputView().
const skeletonMarkup = `
  <button class="webmcp-launcher" part="launcher" type="button" aria-controls="${panelId}" aria-expanded="false"></button>
  <section class="webmcp-panel" part="panel" id="${panelId}">
    <form class="webmcp-command" part="form">
      <label class="webmcp-input-shell">
        <span data-label></span>
        <input data-command-input part="input" type="text" autocomplete="off" spellcheck="false" />
      </label>
      <button class="webmcp-run-button" part="run" type="submit"></button>
    </form>
    <p data-feedback part="feedback" role="status" aria-atomic="true"></p>
    <details class="webmcp-settings">
      <summary class="webmcp-settings-summary">
        <span data-options-label></span>
        <span class="webmcp-status" aria-live="polite" aria-atomic="true"></span>
      </summary>
      <div class="webmcp-settings-grid">
        <label data-provider-field><span></span><select data-provider></select></label>
        <label data-model-field><span></span><select data-model></select></label>
      </div>
    </details>
    <details class="webmcp-diagnostics">
      <summary class="webmcp-disclosure-summary">
        <span data-diagnostics-label></span>
      </summary>
      <div class="webmcp-diagnostics-content">
        <slot name="diagnostics"></slot>
      </div>
    </details>
  </section>
`

/** Builds the shadow tree once. Optional sections start detached and are attached on demand. */
export function createCommandInputDom(root: ShadowRoot): CommandInputDom {
  const style = document.createElement('style')
  style.textContent = getStyles()
  const template = document.createElement('template')
  template.innerHTML = skeletonMarkup
  root.replaceChildren(style, template.content)

  const providerField = query<HTMLElement>(root, '[data-provider-field]')
  const modelField = query<HTMLElement>(root, '[data-model-field]')
  const dom: CommandInputDom = {
    diagnostics: query(root, '.webmcp-diagnostics'),
    diagnosticsLabel: query(root, '[data-diagnostics-label]'),
    feedback: query(root, '[data-feedback]'),
    form: query(root, 'form'),
    input: query(root, '[data-command-input]'),
    label: query(root, '[data-label]'),
    launcher: query(root, '.webmcp-launcher'),
    model: query(root, '[data-model]'),
    modelField,
    modelLabel: query(modelField, 'span'),
    optionsLabel: query(root, '[data-options-label]'),
    panel: query(root, '.webmcp-panel'),
    provider: query(root, '[data-provider]'),
    providerField,
    providerLabel: query(providerField, 'span'),
    root,
    run: query(root, '.webmcp-run-button'),
    settings: query(root, '.webmcp-settings'),
    settingsGrid: query(root, '.webmcp-settings-grid'),
    status: query(root, '.webmcp-status')
  }
  for (const node of [
    dom.launcher,
    dom.settings,
    dom.diagnostics,
    dom.providerField,
    dom.modelField
  ]) {
    node.remove()
  }
  return dom
}

export function applyCommandInputView(dom: CommandInputDom, view: CommandInputViewState): void {
  const { labels } = view
  const showLauncher = view.floating && view.launcher
  setPresent(dom.launcher, showLauncher, dom.root, dom.panel)
  setText(dom.launcher, labels.launcher)
  dom.launcher.setAttribute('aria-expanded', String(view.floatingExpanded))

  dom.panel.classList.toggle('webmcp-floating-panel', view.floating)
  dom.panel.hidden = view.floating && !view.floatingExpanded

  setAttribute(dom.form, 'aria-label', labels.form)
  setText(dom.label, view.label)
  dom.input.placeholder = view.placeholder
  if (dom.input.value !== view.prompt) dom.input.value = view.prompt
  setAttribute(dom.input, 'value', view.prompt)
  dom.input.disabled = view.disabled

  dom.run.dataset.phase = view.phase
  dom.run.type = view.running ? 'button' : 'submit'
  dom.run.toggleAttribute('data-running', view.running)
  if (view.disabled && !view.running) dom.run.setAttribute('aria-disabled', 'true')
  else dom.run.removeAttribute('aria-disabled')
  setText(dom.run, view.running ? labels.stop : view.buttonLabel)

  dom.feedback.dataset.tone = view.tone
  setText(dom.feedback, view.detail)

  const showSettings = Boolean(view.provider || view.model)
  setPresent(dom.settings, showSettings, dom.panel, dom.diagnostics)
  if (dom.settings.open !== view.settingsOpen) dom.settings.open = view.settingsOpen
  setText(dom.optionsLabel, labels.options)
  setText(dom.status, view.optionsStatus)
  setPresent(dom.providerField, Boolean(view.provider), dom.settingsGrid, dom.modelField)
  setText(dom.providerLabel, labels.provider)
  if (view.provider) syncSelect(dom.provider, view.provider)
  setPresent(dom.modelField, Boolean(view.model), dom.settingsGrid)
  setText(dom.modelLabel, labels.model)
  if (view.model) syncSelect(dom.model, view.model)

  setPresent(dom.diagnostics, view.showDiagnostics, dom.panel)
  if (dom.diagnostics.open !== view.diagnosticsOpen) dom.diagnostics.open = view.diagnosticsOpen
  setText(dom.diagnosticsLabel, labels.diagnostics)
}

function syncSelect(select: HTMLSelectElement, state: CommandInputSelectState) {
  const current = Array.from(select.options)
  const unchanged =
    current.length === state.options.length &&
    current.every(function matches(option, index) {
      const next = state.options[index]
      return option.value === next?.value && option.text === next.label
    })
  if (!unchanged) {
    select.replaceChildren(
      ...state.options.map(function createOption(option) {
        return new Option(option.label, option.value)
      })
    )
  }
  if (select.value !== state.selected) select.value = state.selected
}

function setPresent(node: Element, present: boolean, parent: Node, before: Node | null = null) {
  if (!present) {
    node.remove()
    return
  }
  if (node.parentNode === parent) return
  parent.insertBefore(node, before?.parentNode === parent ? before : null)
}

function setText(node: HTMLElement, text: string) {
  if (node.textContent !== text) node.textContent = text
}

function setAttribute(node: Element, name: string, value: string) {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value)
}

function query<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector)
  if (!element) throw new Error(`Command input markup is missing ${selector}.`)
  return element
}
