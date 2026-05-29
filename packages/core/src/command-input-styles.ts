export function getStyles(): string {
  return `
    :host {
      --webmcp-ink: #121815;
      --webmcp-muted: #66746d;
      --webmcp-line: #dbe5df;
      --webmcp-paper: #fbfcfa;
      --webmcp-field: #f4f8f5;
      --webmcp-accent: #1e9f72;
      --webmcp-accent-dark: #0f6f51;
      --webmcp-dark: #09110e;
      display: block;
      position: relative;
      color: var(--webmcp-ink);
      font: 500 1rem/1.4 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    :host([data-floating]) {
      position: fixed;
      right: 8px;
      bottom: 8px;
      z-index: 1000;
      width: auto;
      max-width: min(920px, calc(100vw - 16px));
    }

    * {
      box-sizing: border-box;
    }

    .webmcp-command {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.625rem;
      padding: 0.625rem;
      border: 1px solid var(--webmcp-line);
      background: var(--webmcp-paper);
      box-shadow: 0 16px 36px rgba(4, 10, 8, 0.12);
    }

    .webmcp-input-shell {
      display: flex;
      align-items: center;
      min-width: 0;
      gap: 0.625rem;
      padding: 0 0.875rem;
      border: 1px solid var(--webmcp-line);
      background: var(--webmcp-field);
    }

    .webmcp-input-shell:focus-within {
      border-color: rgba(30, 159, 114, 0.58);
      background: #ffffff;
      box-shadow: 0 0 0 3px rgba(30, 159, 114, 0.12);
    }

    .webmcp-input-shell span {
      flex: 0 0 auto;
      color: var(--webmcp-muted);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    input,
    select,
    button {
      min-width: 0;
      min-height: 2.5rem;
      font: inherit;
    }

    input,
    select {
      width: 100%;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--webmcp-ink);
      font-size: 1rem;
    }

    select,
    .webmcp-settings input {
      padding: 0 0.75rem;
      border: 1px solid var(--webmcp-line);
      background: #ffffff;
    }

    button {
      padding: 0 1.125rem;
      border: 1px solid var(--webmcp-ink);
      background: var(--webmcp-ink);
      color: #ffffff;
      font-weight: 800;
      white-space: nowrap;
      cursor: pointer;
    }

    button:hover:not(:disabled) {
      border-color: var(--webmcp-accent-dark);
      background: var(--webmcp-accent-dark);
    }

    .webmcp-run-button[data-phase="planning"] {
      opacity: 1;
      animation: webmcp-planning-pulse 1.1s ease-in-out infinite;
    }

    button:disabled {
      cursor: progress;
      opacity: 0.7;
    }

    .webmcp-run-button[data-phase="planning"]:disabled {
      opacity: 1;
    }

    :is(button, summary, select, .webmcp-settings input):focus-visible {
      outline: 2px solid var(--webmcp-accent);
      outline-offset: 2px;
    }

    .webmcp-floating-panel {
      position: static;
      display: flex;
      flex-direction: column;
      width: min(920px, calc(100vw - 16px));
      max-height: var(--webmcp-floating-panel-max-height, calc(100svh - 16px));
      overflow: hidden;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.48);
    }

    .webmcp-floating-panel[hidden] {
      display: none;
    }

    .webmcp-settings,
    .webmcp-diagnostics {
      padding: 0;
      border-inline: 1px solid var(--webmcp-line);
      border-bottom: 1px solid var(--webmcp-line);
      background: rgba(255, 255, 255, 0.96);
    }

    .webmcp-diagnostics {
      position: relative;
    }

    .webmcp-settings-summary,
    .webmcp-disclosure-summary {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      min-height: 2.6rem;
      align-items: center;
      gap: 0.65rem;
      width: 100%;
      padding: 0 0.75rem;
      color: var(--webmcp-muted);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    summary:is(.webmcp-settings-summary, .webmcp-disclosure-summary) {
      cursor: pointer;
      list-style: none;
    }

    summary:is(.webmcp-settings-summary, .webmcp-disclosure-summary)::-webkit-details-marker {
      display: none;
    }

    summary:is(.webmcp-settings-summary, .webmcp-disclosure-summary)::before {
      width: 0.45rem;
      height: 0.45rem;
      border-right: 2px solid currentColor;
      border-bottom: 2px solid currentColor;
      content: "";
      transform: rotate(-45deg);
    }

    .webmcp-settings[open] > .webmcp-settings-summary::before,
    .webmcp-diagnostics[open] > .webmcp-disclosure-summary::before {
      transform: rotate(45deg);
    }

    .webmcp-settings > summary:hover,
    .webmcp-diagnostics > summary:hover {
      background: #f2f7f4;
      color: var(--webmcp-ink);
    }

    .webmcp-settings[open] > .webmcp-settings-summary,
    .webmcp-diagnostics[open] > .webmcp-disclosure-summary {
      box-shadow: inset 3px 0 0 var(--webmcp-accent);
      color: var(--webmcp-ink);
    }

    .webmcp-settings--status-only .webmcp-settings-summary {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .webmcp-settings-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.625rem;
      padding: 0.55rem 0.75rem 0.75rem;
      border-top: 1px solid rgba(18, 24, 21, 0.09);
    }

    .webmcp-settings label {
      display: grid;
      min-width: 0;
      gap: 0.3rem;
      color: var(--webmcp-muted);
      font-size: 0.7rem;
      font-weight: 800;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    .webmcp-diagnostics-content {
      position: absolute;
      z-index: 20;
      top: 100%;
      right: 0;
      left: 0;
      max-height: min(40rem, 68svh);
      overflow: auto;
      border: 1px solid rgba(224, 234, 229, 0.18);
      border-top: 0;
      background: var(--webmcp-dark);
      box-shadow: 0 1.2rem 2.5rem rgba(0, 0, 0, 0.32);
    }

    .webmcp-floating-panel .webmcp-diagnostics[open] {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }

    .webmcp-floating-panel .webmcp-diagnostics-content {
      position: static;
      flex: 0 1 auto;
      height: auto;
      min-height: 0;
      max-height: calc(var(--webmcp-floating-panel-max-height, calc(100svh - 16px)) - 9.25rem);
      border-inline: 0;
      box-shadow: none;
      overscroll-behavior: contain;
    }

    .webmcp-floating-panel .webmcp-settings[open] ~ .webmcp-diagnostics .webmcp-diagnostics-content {
      max-height: calc(var(--webmcp-floating-panel-max-height, calc(100svh - 16px)) - 14.5rem);
    }

    .webmcp-status {
      display: inline-flex;
      min-width: 0;
      gap: 0.45rem;
      align-items: center;
      justify-self: end;
      color: var(--webmcp-muted);
      font-size: 0.8rem;
      font-weight: 500;
      text-transform: none;
    }

    .webmcp-status strong,
    .webmcp-status span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .webmcp-status strong {
      color: var(--webmcp-ink);
      font-size: 0.84rem;
    }

    @keyframes webmcp-planning-pulse {
      0%,
      100% {
        opacity: 1;
      }

      50% {
        opacity: 0.62;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .webmcp-run-button[data-phase="planning"] {
        animation: none;
      }
    }

    @media (max-width: 36rem) {
      .webmcp-command,
      .webmcp-settings-grid {
        grid-template-columns: 1fr;
      }

      button {
        width: 100%;
      }
    }
  `
}
