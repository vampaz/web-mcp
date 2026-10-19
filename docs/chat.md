# Independent conversation UI

[Documentation index](./README.md) · [Complete integration](./integration.md) · [API reference](./api-reference.md)

This subpath was introduced in `0.2.0`. Use `0.2.1` or newer for automatic Pi runtime dependency installation when connecting chat to the kit's Pi harness.

`@vampaz/webmcp-kit/chat` defines `<webmcp-chat>` explicitly. It imports controller types only. It can render a fake or application-owned `PiController` without loading the Pi runtime or installing a UI framework. Imports are safe during server rendering; call `defineWebMCPChat()` in the browser.

```ts
import { defineWebMCPChat, type WebMCPChatElement } from '@vampaz/webmcp-kit/chat'

defineWebMCPChat()
const element = document.createElement('webmcp-chat') as WebMCPChatElement
element.configure({
  harness,
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

The host supplies `harness` and `container`, owns account UI, and destroys the controller on teardown. `configure()` replaces the controller subscription and applies the supported configuration. Removing the element unsubscribes; reconnecting subscribes again. Multiple views can share one controller and have distinct control IDs.

`mode: 'inline'` renders in the host's layout. `mode: 'popup'` supplies a floating launcher and a resizable, nonmodal conversation panel. Configure either mode before or after mounting. Changing modes keeps the same controller, history, and draft.

```ts
element.configure({ harness, mode: 'popup', title: 'Ask this page' })
document.body.append(element)
```

The popup starts closed. Its launcher opens it and focuses the composer. Close or Escape returns focus to the launcher. Closing keeps the draft and any running turn; use Stop to cancel. The page remains interactive. Drag the launcher or the Move chat handle; arrow keys move either control, with Shift for larger steps. Resize chat cycles compact and expanded sizes; its arrow keys adjust the size. The lower-right corner also supports pointer resizing. Positions and sizes stay inside the viewport. Popup mode uses the browser's Popover API to avoid ancestor clipping and does not trap focus. The supported current Chromium, Firefox, and WebKit versions provide this API.

The component includes a transcript, composer, Send, Stop, New chat, suggestions, a working indicator, and status. It contains no model selector, endpoint field, API-key entry, provider controls, or account settings. Configure model access in application code, as shown in [Pi setup](./pi.md).

All model and tool text is rendered as text. Tool results start collapsed and preserve expansion during updates. Raw tool requests do not appear as assistant replies. Failed replies keep a visible failure label and collapsed diagnostic details after reopening. Enter sends, Shift+Enter adds a line, and IME composition is preserved. Controls have visible labels and focus indicators. While a turn is active, an animated working indicator appears at the end of the transcript where the reply will arrive; the status region announces state changes without repeating the working state. Restored history opens at the latest message. Later messages scroll into view only when the reader is already near the end. A jump-to-latest button appears while reading earlier messages and indicates new arrivals.

Suggestions appear only with an empty conversation and composer. The composer stays editable during a turn, so users can draft a follow-up while Send is disabled. The 16,000-character limit shows feedback near the limit and blocks oversized sends without truncating the draft. New chat immediately clears the current conversation and draft, then focuses the composer and announces completion. It does not ask for confirmation or undo application actions. If clearing fails, the history and draft stay available with an error message.

If a send fails before the controller records the user message, the composer restores the draft. Messages already present in the transcript stay out of the composer. Completion returns focus to the composer only while the user remains in the chat controls. Reading the transcript or working elsewhere preserves that focus.

Styles live in a shadow root and do not depend on global/demo CSS. The component reflows in narrow containers and respects reduced motion. Available CSS properties:

```css
webmcp-chat {
  --webmcp-chat-background: #fff;
  --webmcp-chat-color: #222b3c;
  --webmcp-chat-muted: #657087;
  --webmcp-chat-accent: #325ce8;
  --webmcp-chat-border: #e1e5ed;
  --webmcp-chat-radius: 1rem;
  --webmcp-chat-height: 75dvh;
  --webmcp-chat-user-background: #f0f3ff;
  --webmcp-chat-button-color: #fff;
}
```

For inline mode, the height is a maximum, not a fixed panel size. Compact values such as `24rem` are supported. The transcript retains a minimum readable height that scales with its font size. When the transcript, header, and composer cannot fit, the panel scrolls to keep the conversation and controls reachable. Use inline mode for a page region or extension side panel. Popup size adapts to the viewport and can be changed by the user. Model, storage, or worker failures remain visible as controller errors; the chat never directs users to nonexistent provider settings.
