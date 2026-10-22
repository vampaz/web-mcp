/**
 * Shadow styles for `<webmcp-command-input>`.
 *
 * Theme tokens form one `--webmcp-*` base layer declared on `:host`. Set them on the element
 * (for example `webmcp-command-input { --webmcp-paper: #17181c; }`) to theme every part:
 *
 * - `--webmcp-ink`: text, primary button background, and text on paper-coloured buttons.
 * - `--webmcp-muted`: secondary text such as field labels and disclosure summaries.
 * - `--webmcp-line`: borders and dividers.
 * - `--webmcp-paper`: panel, feedback, and settings surface; text on ink-coloured buttons.
 * - `--webmcp-field`: command field and select background.
 * - `--webmcp-accent`: focus rings, open disclosures, and informational feedback.
 * - `--webmcp-accent-dark`: primary button hover background.
 * - `--webmcp-dark`: diagnostics surface and shadow colour.
 * - `--webmcp-danger`: error feedback.
 * - `--webmcp-success`: success feedback.
 * - `--webmcp-floating-panel-max-height`: floating panel height limit (default `100svh - 16px`).
 *
 * Parts: `launcher`, `panel`, `form`, `input`, `run`, and `feedback`.
 */
export function getStyles(): string {
  return `
    :host {
      --webmcp-ink: #141414;
      --webmcp-muted: #5d5d58;
      --webmcp-line: #d8d1c7;
      --webmcp-paper: #fffaf1;
      --webmcp-field: #f7f3ec;
      --webmcp-accent: #2458ff;
      --webmcp-accent-dark: #141414;
      --webmcp-dark: #141414;
      --webmcp-danger: #b42318;
      --webmcp-success: #067647;
      --_webmcp-panel-max-height: var(--webmcp-floating-panel-max-height, calc(100svh - 16px));
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
      display: flex;
      flex-direction: column-reverse;
      align-items: flex-end;
      gap: 0.5rem;
      width: auto;
      max-width: min(920px, calc(100% - 16px));
    }

    :host([data-floating-expanded]) {
      width: min(920px, calc(100% - 16px));
    }

    :host([data-launcher]) {
      --_webmcp-panel-max-height: calc(
        var(--webmcp-floating-panel-max-height, calc(100svh - 16px)) - 3.25rem
      );
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
      box-shadow: 0 16px 36px color-mix(in srgb, var(--webmcp-dark) 12%, transparent);
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
      border-color: var(--webmcp-accent);
      background: var(--webmcp-paper);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--webmcp-accent) 14%, transparent);
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
      background: var(--webmcp-paper);
    }

    button {
      padding: 0 1.125rem;
      border: 1px solid var(--webmcp-ink);
      background: var(--webmcp-ink);
      color: var(--webmcp-paper);
      font-weight: 800;
      white-space: nowrap;
      cursor: pointer;
    }

    button:hover:not([aria-disabled="true"]) {
      border-color: var(--webmcp-accent-dark);
      background: var(--webmcp-accent-dark);
    }

    .webmcp-run-button[data-running] {
      background: var(--webmcp-paper);
      color: var(--webmcp-ink);
    }

    .webmcp-run-button[data-running]:hover {
      border-color: var(--webmcp-ink);
      background: color-mix(in srgb, var(--webmcp-ink) 8%, var(--webmcp-paper));
    }

    .webmcp-run-button[data-phase="resolving"] {
      animation: webmcp-resolving-pulse 1.1s ease-in-out infinite;
    }

    button[aria-disabled="true"] {
      cursor: not-allowed;
      opacity: 0.7;
    }

    .webmcp-launcher {
      min-height: 2.75rem;
      box-shadow: 0 16px 36px color-mix(in srgb, var(--webmcp-dark) 24%, transparent);
    }

    .webmcp-launcher[aria-expanded="true"] {
      background: var(--webmcp-paper);
      color: var(--webmcp-ink);
    }

    .webmcp-launcher[aria-expanded="true"]:hover {
      border-color: var(--webmcp-ink);
      background: color-mix(in srgb, var(--webmcp-ink) 8%, var(--webmcp-paper));
    }

    [data-feedback] {
      margin: 0;
      padding: 0.5rem 0.75rem;
      border-inline: 1px solid var(--webmcp-line);
      border-bottom: 1px solid var(--webmcp-line);
      background: var(--webmcp-paper);
      color: var(--webmcp-ink);
      font-size: 0.875rem;
      overflow-wrap: anywhere;
    }

    [data-feedback][data-tone="info"] {
      box-shadow: inset 3px 0 0 var(--webmcp-accent);
    }

    [data-feedback][data-tone="success"] {
      box-shadow: inset 3px 0 0 var(--webmcp-success);
      color: var(--webmcp-success);
    }

    [data-feedback][data-tone="error"] {
      box-shadow: inset 3px 0 0 var(--webmcp-danger);
      color: var(--webmcp-danger);
    }

    :is(button, summary, select, .webmcp-settings input):focus-visible {
      outline: 2px solid var(--webmcp-accent);
      outline-offset: 2px;
    }

    .webmcp-panel {
      min-width: 0;
    }

    .webmcp-floating-panel {
      position: static;
      display: flex;
      flex-direction: column;
      width: 100%;
      max-height: var(--_webmcp-panel-max-height);
      overflow: hidden;
      box-shadow: 0 24px 80px color-mix(in srgb, var(--webmcp-dark) 48%, transparent);
    }

    .webmcp-floating-panel[hidden] {
      display: none;
    }

    .webmcp-settings,
    .webmcp-diagnostics {
      padding: 0;
      border-inline: 1px solid var(--webmcp-line);
      border-bottom: 1px solid var(--webmcp-line);
      background: var(--webmcp-paper);
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
      background: color-mix(in srgb, var(--webmcp-accent) 8%, var(--webmcp-paper));
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
      border-top: 1px solid color-mix(in srgb, var(--webmcp-ink) 9%, transparent);
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
      border: 1px solid color-mix(in srgb, var(--webmcp-paper) 18%, transparent);
      border-top: 0;
      background: var(--webmcp-dark);
      box-shadow: 0 1.2rem 2.5rem color-mix(in srgb, var(--webmcp-dark) 32%, transparent);
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
      max-height: calc(var(--_webmcp-panel-max-height) - 9.25rem);
      border-inline: 0;
      box-shadow: none;
      overscroll-behavior: contain;
    }

    .webmcp-floating-panel .webmcp-settings[open] ~ .webmcp-diagnostics .webmcp-diagnostics-content {
      max-height: calc(var(--_webmcp-panel-max-height) - 14.5rem);
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

    @keyframes webmcp-resolving-pulse {
      0%,
      100% {
        opacity: 1;
      }

      50% {
        opacity: 0.62;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .webmcp-run-button[data-phase="resolving"] {
        animation: none;
      }
    }

    @media (max-width: 36rem) {
      .webmcp-settings-grid {
        grid-template-columns: 1fr;
      }

      :host([data-floating-expanded]) {
        right: 0.5rem;
        left: 0.5rem;
        width: auto;
        max-width: none;
      }

      .webmcp-floating-panel {
        width: 100%;
      }

      .webmcp-command {
        grid-template-columns: 1fr;
        gap: 0.45rem;
        padding: 0.45rem;
      }

      .webmcp-input-shell {
        gap: 0.45rem;
        padding: 0 0.62rem;
      }

      .webmcp-input-shell span {
        font-size: 0.68rem;
      }

      button {
        width: 100%;
      }

      .webmcp-launcher {
        width: auto;
      }

      .webmcp-run-button {
        padding-inline: 0.85rem;
      }

      .webmcp-settings-summary,
      .webmcp-disclosure-summary {
        min-height: 2.2rem;
        padding-inline: 0.65rem;
      }

      .webmcp-status {
        display: none;
      }
    }
  `
}
