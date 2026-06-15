import { escapeAttribute, escapeHtml } from './command-input-html'
import { getStyles } from './command-input-styles'
import type { WebMCPCommandInputPhase } from './interfaces/command-input'

export interface CommandInputViewState {
  buttonLabel: string
  diagnosticsOpen: boolean
  disabled: boolean
  floating: boolean
  floatingExpanded: boolean
  modelControlMarkup: string
  optionsStatus: string
  phase: WebMCPCommandInputPhase
  placeholder: string
  prompt: string
  providerControlMarkup: string
  running: boolean
  settingsOpen: boolean
  showDiagnostics: boolean
  showSettings: boolean
}

export function getStructureSignature(view: CommandInputViewState): string {
  return JSON.stringify({
    floating: view.floating,
    modelControlMarkup: view.modelControlMarkup,
    providerControlMarkup: view.providerControlMarkup,
    showDiagnostics: view.showDiagnostics,
    showSettings: view.showSettings
  })
}

export function getShadowMarkup(view: CommandInputViewState): string {
  const commandMarkup = getCommandMarkup(view)

  return view.floating
    ? `
        <style>${getStyles()}</style>
        <section
          class="webmcp-floating-panel"
          ${view.floatingExpanded ? '' : 'hidden'}
        >
          ${commandMarkup}
        </section>
      `
    : `
        <style>${getStyles()}</style>
        ${commandMarkup}
      `
}

function getCommandMarkup(view: CommandInputViewState): string {
  return `
        <form class="webmcp-command" aria-label="WebMCP command input">
          <label class="webmcp-input-shell">
            <span>WebMCP</span>
            <input
              data-command-input
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="${escapeAttribute(view.placeholder)}"
              value="${escapeAttribute(view.prompt)}"
              ${view.disabled ? 'disabled' : ''}
            />
          </label>
          <button
            class="webmcp-run-button"
            type="submit"
            data-phase="${escapeAttribute(view.phase)}"
            ${view.running || view.disabled ? 'disabled' : ''}
            aria-busy="${String(view.running)}"
          >
            ${escapeHtml(view.buttonLabel)}
          </button>
        </form>
        ${
          view.showSettings
            ? `
          <details class="webmcp-settings" ${view.settingsOpen ? 'open' : ''}>
            <summary class="webmcp-settings-summary">
              <span>Options</span>
              <span class="webmcp-status" aria-live="polite" aria-atomic="true">
              ${escapeHtml(view.optionsStatus)}
              </span>
            </summary>
            <div class="webmcp-settings-grid">
              ${view.providerControlMarkup}
              ${view.modelControlMarkup}
            </div>
          </details>
        `
            : ''
        }
        ${
          view.showDiagnostics
            ? `
          <details class="webmcp-diagnostics" ${view.diagnosticsOpen ? 'open' : ''}>
            <summary class="webmcp-disclosure-summary">
              <span>Developer diagnostics</span>
            </summary>
            <div class="webmcp-diagnostics-content">
              <slot name="diagnostics"></slot>
            </div>
          </details>
        `
            : ''
        }
      `
}
