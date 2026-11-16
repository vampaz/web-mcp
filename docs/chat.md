# Independent conversation UI

[Documentation index](./README.md) · [Complete integration](./integration.md) · [API reference](./api-reference.md)

`@vampaz/webmcp-kit/chat` defines `<webmcp-chat>` explicitly. It imports controller types only. It can render a fake or application-owned `PiController` without loading the Pi runtime or installing a UI framework. Imports are safe during server rendering; call `defineWebMCPChat()` in the browser.

Use `/assistant` and `mountAssistant()` when the page should also create the Pi controller and manage its startup and teardown. This entry remains for application-owned controllers, custom tool hosts, and UI-only use.

```ts
import { defineWebMCPChat, type WebMCPChatElement } from '@vampaz/webmcp-kit/chat'

defineWebMCPChat()
const element = document.createElement('webmcp-chat') as WebMCPChatElement
element.configure({
  controller,
  mode: 'inline', // The default. Use 'popup' for a floating chat.
  title: 'Application assistant',
  assistantLabel: 'Assistant',
  placeholder: 'Ask about this page',
  emptyState: 'Ask a question to start.',
  suggestedPrompts: ['What actions are available?'],
  suggestionAction: 'draft', // Or 'send' to submit a suggestion immediately.
  toolLabel(toolName) {
    return toolName.replaceAll('_', ' ')
  },
  toolDetails: 'full', // Or 'hidden' to remove argument previews and expansion.
  persistKey: 'support-chat', // Opt in to popup state persistence.
  disabled: false
})
container.append(element)
```

The host supplies `controller` and `container`, owns account UI, and destroys the controller on teardown. `configure()` replaces the controller subscription and applies the supported configuration; supply the complete desired options each time. Setting `element.controller` keeps the other options. Removing the element unsubscribes; reconnecting subscribes again. Multiple views can share one controller and have distinct control IDs.

## Presentation

`mode: 'inline'` renders in the host's layout with a default block size equal to `--webmcp-chat-min-height`, so the composer does not move as messages arrive. A host rule such as `webmcp-chat { block-size: 100% }` overrides that default. `mode: 'popup'` supplies a floating launcher and a resizable, nonmodal conversation panel. Changing modes keeps the same controller, history, and draft.

```ts
element.configure({ controller, mode: 'popup', title: 'Ask this page', placement: 'start' })
document.body.append(element)
```

The popup starts closed. Its launcher opens it and focuses the composer. Close, Escape, or the launcher returns focus to the launcher, even in browsers that do not focus a clicked button. `close()` from code moves focus only if it was inside the chat. Closing keeps the draft and any running turn; use Stop to cancel. The page remains interactive. Drag the launcher or the Move chat handle; arrow keys move either control, with Shift for larger steps. Resize chat cycles compact and expanded sizes; its arrow keys adjust the size, and the inline-end lower corner supports pointer resizing. The launcher sits on the inline-end side by default, which is the left in right-to-left pages; `placement: 'start'` uses the other side. Positions and sizes stay inside the viewport. Below about 30rem the popup becomes a full-width bottom sheet. Moving the element in the DOM keeps an open popup open. Popup mode uses the browser's Popover API to avoid ancestor clipping and does not trap focus.

When a reply arrives or a turn ends while the popup is closed, the launcher shows a dot and uses the “Open … new reply” accessible name. Opening the popup clears it. Restored history does not mark the launcher unread. Set `persistKey` to remember the open state, launcher position and panel size in `localStorage` under `webmcp-chat:<persistKey>`; it stores no messages, drafts or other content, ignores malformed or blocked storage, and keeps the popup inside the viewport after a resize. The default bottom-end launcher anchor is preserved across viewport changes; only user-moved coordinates are stored and clamped to the current viewport.

Static `mode`, `theme`, `placement`, `heading` and `placeholder` attributes are defaults for a controller-only mount. Values passed to `configure()` win, and the controller still comes from `configure()` or the `controller` property. Use the `heading` attribute for the visible title; the global `title` attribute is not used and would only add a browser tooltip.

Control the element from application code:

| Member              | Effect                                             |
| ------------------- | -------------------------------------------------- |
| `open()`, `close()` | Open or close the popup; no effect in inline mode. |
| `toggle()`          | Toggle the popup.                                  |
| `focusComposer()`   | Focus the composer, opening a closed popup first.  |
| `setDraft(text)`    | Replace the composer draft without sending it.     |
| `openSettings()`    | Open the settings view; needs `settings`.          |
| `openModelPicker()` | Open the composer model picker; needs `settings`.  |

The element dispatches `webmcp-chat-toggle` (`detail: { open }`) and `webmcp-chat-send` (`detail: { text }`). Both bubble and cross shadow boundaries.

## Conversation behavior

The component includes a transcript, composer, Send, Stop, New chat, suggestions, a working indicator, and status. Provider, model, and approval controls are optional. Omit `settings` to keep the conversation-only UI. Configure model access in application code, as shown in [Pi setup](./pi.md).

While a turn runs, the working row shows the controller's `activity`: “Thinking…”, “Running set_counter…”, “Waiting for your approval: set_counter”, or “Summarizing earlier conversation…”. The status region announces each change once. A controller without `activity` shows “Working…”.

User messages appear as bubbles and assistant replies as plain text. The “You” and assistant labels stay available to screen readers but are not shown. Each assistant reply has a Copy button that announces the result in the status region.

Consecutive tool calls form one activity block headed “Used N tools”. Each call is a collapsed row with a status icon, the tool name and a one-line argument preview; expanding it shows the input and output in monospace. Use `toolLabel(name)` for friendly display names in rows and activity text. Set `toolDetails: 'hidden'` to remove argument previews and prevent expansion. A failed call shows “Failed”, a declined call shows “Declined” with a neutral icon and colour, and a call whose outcome is unknown after an interruption shows “Outcome unknown”; screen readers hear “name — failed”, “name — declined”, or “name — outcome unknown”. While a tool runs, the working row shows a spinner. Raw tool requests do not appear as assistant replies. Failed replies keep a visible failure label and collapsed diagnostic details after reopening.

Errors appear in the status region under the composer, in place of the send hint. Provider failures use “The model could not be reached. Try again.”; other errors keep their message, including the check-application-state warning when an action may have run. After a completed action, a provider failure instead says “The last response failed. Check application state before sending a new request.” A declined action shows “You declined this action. Nothing was changed.” in neutral text, before and after reopening. When `usage` reaches 90% of `maxHistoryBytes`, the status warns “This conversation is almost full. Start a new chat soon.”; error status takes priority. The region is empty while idle. Stop replaces Send while a turn runs. After a failed or interrupted turn, “Edit last message” puts the last user message back in the composer without sending it. “Try again” resends the last user message once when the composer is empty, the action was not declined, the action cannot have run, and no tool call after that message completed, failed, or returned an unknown outcome. A retry is hidden after any action that started, because resending the request could repeat a write; it stays available when the turn failed before an action ran. Both actions hide while the composer has text.

Enter sends and Shift+Enter adds a line on devices with a fine pointer. On touch devices Enter adds a line and the Send button sends. IME composition is preserved. Suggestions appear only with an empty conversation and composer. The composer stays editable during a turn, so users can draft a follow-up while Stop replaces Send. `maxMessageLength` (default 16,000) shows feedback near the limit and blocks oversized sends without truncating the draft; match it to the controller's `maxMessageChars` limit.

New chat immediately calls `controller.clear()` without confirmation. After clearing succeeds, it resets the draft, focuses the composer, and announces completion. Clearing never undoes application actions. If clearing fails, the history and draft stay available with an error message.

If a send fails before the controller records the user message, the composer restores the draft. Completion returns focus to the composer only while the user remains in the chat controls. Restored history opens at the latest message. Later messages scroll into view only when the reader is already near the end; a jump-to-latest button appears while reading earlier messages and indicates new arrivals.

## In-chat approval

The element can render an application-owned approval card without installing a confirmation handler:

```ts
setConfirmationHandler(function approve(request) {
  if (request.source !== 'pi') return showApplicationDialog(request)
  return element.requestApproval({
    toolName: request.tool.name,
    input: request.input,
    reason: request.reason,
    signal: request.signal
  })
})
```

`requestApproval()` shows the reason, friendly tool label and argument summary at the end of the transcript, opens a closed popup, and focuses Deny first. Approve and Deny resolve the promise and both carry an accessible description built from the reason, tool label, and argument summary. Abort, controller replacement, or disconnect resolves `false`; a newer request replaces and denies the pending card. The kit never installs a handler itself and never grants approval. Keep `source` checks so page-bridge, native, devtools, resolver and MCP-bridge calls still use the application's dialog. `WebMCPChatApprovalRequest` is exported from the `/chat` entry.

## Optional settings module

Pass `settings` to add a model button to the composer and a **Settings** icon to the header. The model button opens a picker grouped by provider; providers can add a `description` beside their heading and an `icon` (`cloud`, `route`, `server` or `chip`), and models can add a `detail` line and a `badge`. A provider without models appears as one option with its own `detail` and `badge`. A search field appears when there are more than eight options. The picker follows the listbox pattern: arrow keys, Home and End move, Enter chooses, Escape closes and returns focus to the button. Settings opens as a full view with a back button and the optional approval control. The module adds no model provider or inference dependency.

```ts
import type { WebMCPChatSettings } from '@vampaz/webmcp-kit/chat'

const settings: WebMCPChatSettings = {
  providers: [
    {
      id: 'local',
      label: 'Local model',
      description: 'On this computer',
      icon: 'server',
      models: [{ model: 'my-model', label: 'My model', detail: '32K context' }]
    }
  ],
  providerId: 'local',
  model: 'my-model',
  detail: 'Runs through the application’s local model connection.',
  disabled: false,
  onChange(providerId, model) {
    // The application switches its resolver/controller, then reconfigures the chat.
    selectApplicationModel(providerId, model)
  },
  confirmations: {
    enabled: true,
    onChange(enabled) {
      // Update the application's existing confirmation handler preference.
      setApplicationApprovalPreference(enabled)
    }
  }
}
element.configure({ controller, settings })
```

The callbacks above are application functions. The module does not create resolvers, fetch model lists, persist preferences, or grant approval. It reports the chosen option through `onChange(providerId, model)`; `model` is `undefined` for a provider offered without models. Choosing the current option does not call `onChange`. Reconfigure with the selected values and the complete options after a change. Use `settings.disabled` during active turns or provider changes, `detail` for status, and `error` for a visible failure. Omit `confirmations` if users must not change your approval policy. Never put credentials in provider labels, model IDs, status text, or slotted content.

Scope an approval preference by caller. `ConfirmationRequest` includes `source`, `invocationId`, and `callerRequired`; only skip the dialog for the source the preference belongs to, for example `source === 'pi'`, and still ask when `callerRequired` is true. A handler that returns `true` whenever the chat preference is off also auto-approves page-bridge, native, devtools, resolver, and MCP-bridge calls.

Settings replace the visible conversation while open, preserving its transcript, draft, and running turn. In inline mode they also replace the header. The back button or Escape returns focus to the icon; Escape closes settings before closing a popup. The module keeps controls mounted and focused across configuration updates. Omit `settings` on reconfiguration to remove it. `focusComposer()` returns to the conversation. Keep a disabled, application-owned controller/view available during initialization or provider failure if users need settings to recover.

Use the `settings` slot for app-specific diagnostics or additional controls:

```html
<webmcp-chat>
  <p slot="settings">Model preferences carry across application pages.</p>
</webmcp-chat>
```

The local lab uses this module to select LM Studio chat models or Chrome built-in AI and set its approval preference, with Presentation in the slot. Automated test responses are available only on the separate test server. The standalone demo uses it for provider/model selection and approvals, and supplies its Jev note and developer diagnostics through the slot.

## Message rendering

All model and tool text is rendered as text by default. To render formatting, supply `renderMessage(message, target)`. It runs for user and assistant message bodies when their text changes; return `true` to skip the default text rendering. Message text is untrusted user and model output, so sanitize anything you insert as HTML.

```ts
import { renderMarkdown } from '@vampaz/webmcp-kit/chat/markdown'

element.configure({
  controller,
  renderMessage(message, target) {
    if (message.role !== 'assistant') return false
    renderMarkdown(message.text, target)
    return true
  }
})
```

`renderMarkdown()` builds DOM nodes and text only. It supports paragraphs, line breaks, bold, italic, inline code, fenced code, ordered and unordered lists, and links using `http:`, `https:` or `mailto:`. Other links and raw HTML render as text. Links open with `rel="noopener noreferrer"` in a new tab. Intraword underscores such as `set_counter_value` and asterisks separated by spaces such as `2 * 3 * 4` stay literal.

## Labels and localization

Every visible string comes from `labels`. Pass a partial object; omitted keys keep their English defaults. Functions format parameterized text, and `locale` formats the character count.

```ts
element.configure({
  controller,
  locale: 'pt-PT',
  labels: {
    newChat: 'Nova conversa',
    send: 'Enviar',
    awaitingApproval: (tool) => `À espera da sua aprovação: ${tool}`
  }
})
```

See `WebMCPChatLabels` and `WebMCPChatStatusLabels` in the [API reference](./api-reference.md) for every key.

## Styling

Styles live in a shadow root and do not depend on application styles. Inner sizes use `em`, so `webmcp-chat { font-size: 1.125rem }` scales the whole component. The component reflows in narrow containers, respects reduced motion, and supports forced-colors mode.

`theme: 'light'` is the default. `theme: 'dark'` uses the dark palette, and `theme: 'auto'` follows `prefers-color-scheme`. Explicit custom properties override either palette:

```css
webmcp-chat {
  --webmcp-chat-background: #fff;
  --webmcp-chat-surface: #f6f7f9;
  --webmcp-chat-color: #171c27;
  --webmcp-chat-muted: #5f6b7f;
  --webmcp-chat-accent: #3b5bdb;
  --webmcp-chat-error: #b42318;
  --webmcp-chat-success: #15803d;
  --webmcp-chat-warning: #8a5007;
  --webmcp-chat-border: #e6e8ee;
  --webmcp-chat-line-strong: #d3d8e1;
  --webmcp-chat-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --webmcp-chat-radius: 1.15em;
  --webmcp-chat-height: 75dvh;
  --webmcp-chat-min-height: 36.5em;
  --webmcp-chat-user-background: #eef2fe;
  --webmcp-chat-button-color: #fff;
  --webmcp-chat-popup-width: 30em;
  --webmcp-chat-popup-height: 41em;
  --webmcp-chat-popup-expanded-width: 52em;
  --webmcp-chat-popup-expanded-height: 50em;
  --webmcp-chat-offset: 0.5rem;
}
```

These are the light-theme defaults; the dark theme uses its own colours unless you set them. Style internal elements through `::part()`: `panel`, `header`, `title`, `launcher`, `transcript`, `message`, `message-user`, `message-assistant`, `message-tool`, `composer`, `textarea`, `send`, `stop`, `new-chat`, `suggestion`, `status`, `jump-latest`, `settings-button`, `settings`, `model-button`, and `model-picker`.

```css
webmcp-chat::part(message-assistant) {
  line-height: 1.6;
}
```

Slots add host content: `identity` (replaces the assistant mark and visible title, for example with the current site; the title stays the panel's accessible name), `header-actions` (buttons beside New chat), `before-composer` (notices directly above the composer card), `composer-meta` (content in the row under the composer, beside the send hint), `footer` (for example a disclaimer below the composer), `empty` (replaces the empty-state text and its centred layout), and `settings` (additional content in the optional settings panel).

```html
<webmcp-chat>
  <p slot="composer-meta">Local model · my-model</p>
  <a slot="footer" href="/assistant-policy">How the assistant uses page data</a>
</webmcp-chat>
```

Model or storage failures remain visible as controller errors. Settings are available only when the application opts in.
