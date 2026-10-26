# Independent conversation UI

[Documentation index](./README.md) · [Complete integration](./integration.md) · [API reference](./api-reference.md)

`@vampaz/webmcp-kit/chat` defines `<webmcp-chat>` explicitly. It imports controller types only. It can render a fake or application-owned `PiController` without loading the Pi runtime or installing a UI framework. Imports are safe during server rendering; call `defineWebMCPChat()` in the browser.

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
  disabled: false
})
container.append(element)
```

The host supplies `controller` and `container`, owns account UI, and destroys the controller on teardown. `configure()` replaces the controller subscription and applies the supported configuration; supply the complete desired options each time. Setting `element.controller` keeps the other options. Removing the element unsubscribes; reconnecting subscribes again. Multiple views can share one controller and have distinct control IDs.

## Presentation

`mode: 'inline'` renders in the host's layout and fills the height the host gives it (`webmcp-chat { block-size: 100% }`), down to `--webmcp-chat-min-height`. `mode: 'popup'` supplies a floating launcher and a resizable, nonmodal conversation panel. Changing modes keeps the same controller, history, and draft.

```ts
element.configure({ controller, mode: 'popup', title: 'Ask this page', placement: 'start' })
document.body.append(element)
```

The popup starts closed. Its launcher opens it and focuses the composer. Close, Escape, or the launcher returns focus to the launcher, even in browsers that do not focus a clicked button. `close()` from code moves focus only if it was inside the chat. Closing keeps the draft and any running turn; use Stop to cancel. The page remains interactive. Drag the launcher or the Move chat handle; arrow keys move either control, with Shift for larger steps. Resize chat cycles compact and expanded sizes; its arrow keys adjust the size, and the inline-end lower corner supports pointer resizing. The launcher sits on the inline-end side by default, which is the left in right-to-left pages; `placement: 'start'` uses the other side. Positions and sizes stay inside the viewport. Below about 30rem the popup becomes a full-width bottom sheet. Moving the element in the DOM keeps an open popup open. Popup mode uses the browser's Popover API to avoid ancestor clipping and does not trap focus.

Control the element from application code:

| Member              | Effect                                             |
| ------------------- | -------------------------------------------------- |
| `open()`, `close()` | Open or close the popup; no effect in inline mode. |
| `toggle()`          | Toggle the popup.                                  |
| `focusComposer()`   | Focus the composer, opening a closed popup first.  |
| `setDraft(text)`    | Replace the composer draft without sending it.     |

The element dispatches `webmcp-chat-toggle` (`detail: { open }`) and `webmcp-chat-send` (`detail: { text }`). Both bubble and cross shadow boundaries.

## Conversation behavior

The component includes a transcript, composer, Send, Stop, New chat, suggestions, a working indicator, and status. It contains no model selector, endpoint field, API-key entry, provider controls, or account settings. Configure model access in application code, as shown in [Pi setup](./pi.md).

While a turn runs, the working row shows the controller's `activity`: “Thinking…”, “Running set_counter…”, “Waiting for your approval: set_counter”, or “Summarizing earlier conversation…”. The status region announces each change once. A controller without `activity` shows “Working…”.

Tool messages start collapsed and show the tool's input and output in monospace. A failed tool is labeled “— failed”; a tool whose outcome is unknown after an interruption is labeled “— outcome unknown”. Raw tool requests do not appear as assistant replies. Failed replies keep a visible failure label and collapsed diagnostic details after reopening.

Errors appear in the status region with an error colour and icon at body size. The region is empty while idle. After a failed or interrupted turn, “Edit last message” puts the last user message back in the composer without sending it; it is hidden while the composer has text.

Enter sends and Shift+Enter adds a line on devices with a fine pointer. On touch devices Enter adds a line and the Send button sends. IME composition is preserved. Suggestions appear only with an empty conversation and composer. The composer stays editable during a turn, so users can draft a follow-up while Send is disabled. `maxMessageLength` (default 16,000) shows feedback near the limit and blocks oversized sends without truncating the draft; match it to the controller's `maxMessageChars` limit.

New chat immediately calls `controller.clear()` without confirmation. After clearing succeeds, it resets the draft, focuses the composer, and announces completion. Clearing never undoes application actions. If clearing fails, the history and draft stay available with an error message.

If a send fails before the controller records the user message, the composer restores the draft. Completion returns focus to the composer only while the user remains in the chat controls. Restored history opens at the latest message. Later messages scroll into view only when the reader is already near the end; a jump-to-latest button appears while reading earlier messages and indicates new arrivals.

## Message rendering

All model and tool text is rendered as text by default. To render formatting, supply `renderMessage(message, target)`. It runs for user and assistant message bodies when their text changes; return `true` to skip the default text rendering. Message text is untrusted user and model output, so sanitize anything you insert as HTML.

```ts
element.configure({
  controller,
  renderMessage(message, target) {
    if (message.role !== 'assistant') return false
    target.replaceChildren(renderSafeMarkdown(message.text))
    return true
  }
})
```

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
  --webmcp-chat-color: #222b3c;
  --webmcp-chat-muted: #657087;
  --webmcp-chat-accent: #325ce8;
  --webmcp-chat-error: #b42318;
  --webmcp-chat-border: #e1e5ed;
  --webmcp-chat-radius: 1.15em;
  --webmcp-chat-height: 75dvh;
  --webmcp-chat-min-height: 36.5em;
  --webmcp-chat-user-background: #f0f3ff;
  --webmcp-chat-button-color: #fff;
  --webmcp-chat-popup-width: 30em;
  --webmcp-chat-popup-height: 41em;
  --webmcp-chat-popup-expanded-width: 52em;
  --webmcp-chat-popup-expanded-height: 50em;
  --webmcp-chat-offset: 0.5rem;
}
```

These are the light-theme defaults; the dark theme uses its own colours unless you set them. Style internal elements through `::part()`: `panel`, `header`, `title`, `launcher`, `transcript`, `message`, `message-user`, `message-assistant`, `message-tool`, `composer`, `textarea`, `send`, `stop`, `new-chat`, `suggestion`, `status`, and `jump-latest`.

```css
webmcp-chat::part(message-assistant) {
  line-height: 1.6;
}
```

Slots add host content: `header-actions` (buttons beside New chat), `footer` (for example a disclaimer below the composer), and `empty` (replaces the empty-state text).

```html
<webmcp-chat>
  <a slot="footer" href="/assistant-policy">How the assistant uses page data</a>
</webmcp-chat>
```

Model or storage failures remain visible as controller errors; the chat never directs users to nonexistent provider settings.
