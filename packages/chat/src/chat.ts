import type { PiSnapshot } from '@vampaz/webmcp-kit/pi'
import type { WebMCPChatElement, WebMCPChatOptions } from './interfaces/chat'
import { statusText, updateTranscript } from './render'
import { chatStyles, popupStyles } from './styles'
import { ChatPopup } from './popup'
import { icon } from './icon'

let instanceCount = 0
const messageLimit = 16000

export function defineWebMCPChat(): void {
  if (typeof customElements === 'undefined' || customElements.get('webmcp-chat')) return
  class ChatElement extends HTMLElement implements WebMCPChatElement {
    private options?: WebMCPChatOptions
    private unsubscribe?: () => void
    private snapshot: PiSnapshot = { state: 'loading', messages: [] }
    private revision = 0
    private sending = false
    private clearing = false
    private initiallyScrolled = false
    private latestMessage = ''
    private unread = false
    private readonly focusTrackers = new Set<() => boolean>()
    private readonly root = this.attachShadow({ mode: 'open' })
    private readonly resizeObserver = new ResizeObserver(() => {
      if (!this.initiallyScrolled) this.update()
      else this.updateJump()
    })
    private readonly instanceId = `webmcp-chat-${++instanceCount}`
    private readonly status: HTMLParagraphElement
    private readonly transcript: HTMLDivElement
    private readonly list: HTMLOListElement
    private readonly empty: HTMLParagraphElement
    private readonly working: HTMLParagraphElement
    private readonly heading: HTMLHeadingElement
    private readonly input: HTMLTextAreaElement
    private readonly sendButton: HTMLButtonElement
    private readonly stopButton: HTMLButtonElement
    private readonly clearButton: HTMLButtonElement
    private readonly suggestions: HTMLDivElement
    private readonly limit: HTMLParagraphElement
    private readonly jumpButton: HTMLButtonElement
    private readonly popup: ChatPopup

    constructor() {
      super()
      this.root.innerHTML = `<style>${chatStyles}${popupStyles}</style>
        <div class="presentation">
        <section class="panel" id="${this.instanceId}-panel" aria-labelledby="${this.instanceId}-title">
          <header>
            <div class="identity"><span class="assistant-mark">${icon('M5 5h14v11H10l-5 4V5M9 9h6M9 12h4')}</span><h2 id="${this.instanceId}-title"></h2></div>
            <div class="header-actions"><button class="icon-button" type="button" data-clear aria-label="New chat" title="New chat">${icon('M12 5v14M5 12h14')}</button></div>
          </header>
          <div class="conversation">
            <div class="transcript" tabindex="0" role="log" aria-label="Conversation"><p data-empty></p><ol></ol><p class="working" hidden><span class="visually-hidden">Working…</span><span class="working-dots" aria-hidden="true"><span></span><span></span><span></span></span></p></div>
            <button type="button" class="jump-latest" hidden>Jump to latest</button>
          </div>
          <form class="composer">
            <div class="suggestions"></div>
            <div class="message-box">
              <label class="visually-hidden" for="${this.instanceId}-message">Message</label>
              <textarea id="${this.instanceId}-message" rows="2" aria-describedby="${this.instanceId}-hint ${this.instanceId}-limit"></textarea>
              <div class="actions"><button type="button" data-stop>${icon('M7 7h10v10H7z')}<span>Stop</span></button><button class="send icon-button" type="submit" aria-label="Send" title="Send">${icon('M12 19V5M6 11l6-6 6 6')}</button></div>
            </div>
            <div class="composer-meta"><p class="status" role="status" aria-live="polite"></p><p class="hint" id="${this.instanceId}-hint">Enter to send · Shift+Enter for a new line</p></div>
            <p class="limit" id="${this.instanceId}-limit" hidden></p>
          </form>
        </section>
        </div>`
      this.heading = this.root.querySelector('h2')!
      this.status = this.root.querySelector('.status')!
      this.transcript = this.root.querySelector('.transcript')!
      this.list = this.root.querySelector('ol')!
      this.empty = this.root.querySelector('[data-empty]')!
      this.working = this.root.querySelector('.working')!
      this.input = this.root.querySelector('textarea')!
      this.sendButton = this.root.querySelector('[type=submit]')!
      this.stopButton = this.root.querySelector('[data-stop]')!
      this.clearButton = this.root.querySelector('[data-clear]')!
      this.suggestions = this.root.querySelector('.suggestions')!
      this.limit = this.root.querySelector('.limit')!
      this.jumpButton = this.root.querySelector('.jump-latest')!
      this.popup = new ChatPopup(
        this,
        this.root.querySelector('.presentation')!,
        this.root.querySelector('section')!,
        this.heading.id
      )
      this.root.querySelector('.composer')!.addEventListener('submit', (event) => {
        event.preventDefault()
        void this.send()
      })
      this.input.addEventListener('input', () => this.updateComposer())
      this.input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
          event.preventDefault()
          void this.send()
        }
      })
      this.stopButton.addEventListener('click', () => {
        void this.perform('stop')
      })
      this.clearButton.addEventListener('click', () => {
        this.clearButton.focus()
        void this.perform('clear')
      })
      this.transcript.addEventListener('scroll', () => this.updateJump())
      this.jumpButton.addEventListener('click', () => {
        this.transcript.scrollTop = this.transcript.scrollHeight
        this.transcript.focus({ preventScroll: true })
        this.updateJump()
      })
      this.update()
    }

    connectedCallback() {
      this.popup.connect()
      this.resizeObserver.observe(this.transcript)
      this.connect()
    }
    disconnectedCallback() {
      this.popup.disconnect()
      this.revision++
      this.sending = false
      this.clearing = false
      this.resizeObserver.disconnect()
      for (const finish of this.focusTrackers) finish()
      this.unsubscribe?.()
      this.unsubscribe = undefined
    }

    configure(options: WebMCPChatOptions) {
      if (!options?.harness) throw new Error('Configure a conversation controller.')
      if (this.options?.harness !== options.harness) {
        this.input.value = ''
        this.list.replaceChildren()
        this.initiallyScrolled = false
        this.latestMessage = ''
        this.unread = false
        this.revision++
        this.sending = false
        this.clearing = false
        for (const finish of this.focusTrackers) finish()
      }
      this.unsubscribe?.()
      this.unsubscribe = undefined
      this.options = { ...options }
      this.heading.textContent = options.title ?? 'Assistant'
      this.popup.configure(options.mode ?? 'inline', this.heading.textContent)
      this.input.placeholder = options.placeholder ?? 'Ask the assistant'
      this.empty.textContent =
        options.emptyState ?? 'Ask a question or choose a suggestion to start.'
      this.suggestions.replaceChildren()
      for (const prompt of options.suggestedPrompts ?? []) {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = prompt
        button.addEventListener('click', () => {
          this.input.value = prompt
          this.updateComposer()
          this.input.focus()
        })
        this.suggestions.append(button)
      }
      if (this.isConnected) this.connect()
      this.update()
    }

    private connect() {
      this.unsubscribe?.()
      if (this.options) this.unsubscribe = this.options.harness.subscribe(() => this.update())
    }

    private update() {
      const snapshot: PiSnapshot = this.options?.harness.getSnapshot() ?? {
        state: 'loading',
        messages: []
      }
      this.snapshot = snapshot
      const nearEnd = this.nearEnd()
      const latestMessage = JSON.stringify(snapshot.messages.at(-1)) ?? ''
      if (latestMessage !== this.latestMessage && !nearEnd) this.unread = true
      this.latestMessage = latestMessage
      updateTranscript(this.list, snapshot.messages, this.options?.assistantLabel ?? 'Assistant')
      this.empty.hidden = snapshot.messages.length > 0 || this.isWorking()
      this.updateComposer(nearEnd)
    }

    private updateComposer(nearEnd = this.nearEnd()) {
      const snapshot = this.snapshot
      const working = this.isWorking()
      this.suggestions.hidden = snapshot.messages.length > 0 || this.input.value.length > 0
      this.working.hidden = !working
      const status = this.clearing
        ? 'Starting new chat…'
        : working && !snapshot.error
          ? ''
          : statusText(snapshot)
      if (this.status.textContent !== status) this.status.textContent = status
      const busy =
        this.sending || this.clearing || ['running', 'stopping', 'loading'].includes(snapshot.state)
      const busyState = String(busy)
      if (this.list.getAttribute('aria-busy') !== busyState)
        this.list.setAttribute('aria-busy', busyState)
      const disabled = !this.options || this.options.disabled || snapshot.state === 'closed'
      const tooLong = this.input.value.length > messageLimit
      this.input.disabled = Boolean(disabled || this.clearing || snapshot.state === 'loading')
      this.input.setAttribute('aria-invalid', String(tooLong))
      this.limit.hidden = this.input.value.length < messageLimit * 0.9
      this.limit.textContent = tooLong
        ? `${this.input.value.length.toLocaleString()} / 16,000 characters. Shorten your message to send it; your full draft is kept.`
        : `${this.input.value.length.toLocaleString()} / 16,000 characters`
      this.sendButton.disabled = Boolean(disabled || busy || tooLong || !this.input.value.trim())
      this.stopButton.disabled = Boolean(disabled || snapshot.state !== 'running')
      this.stopButton.hidden = !['running', 'stopping'].includes(snapshot.state)
      this.clearButton.disabled = Boolean(
        disabled ||
        busy ||
        (!snapshot.messages.length &&
          !this.input.value.length &&
          !['error', 'interrupted'].includes(snapshot.state))
      )
      for (const button of this.suggestions.querySelectorAll('button'))
        button.disabled = Boolean(disabled || busy)
      if (this.isConnected && (!this.initiallyScrolled || nearEnd)) {
        this.transcript.scrollTop = this.transcript.scrollHeight
        this.initiallyScrolled = snapshot.state !== 'loading' && this.transcript.clientHeight > 0
      }
      this.updateJump()
    }

    private isWorking() {
      const state = this.snapshot.state
      if (state === 'running' || state === 'stopping') return true
      if (state === 'interrupted' || state === 'error' || state === 'closed') return false
      return this.sending
    }

    private nearEnd() {
      return (
        this.transcript.scrollHeight - this.transcript.scrollTop - this.transcript.clientHeight < 64
      )
    }

    private updateJump() {
      const nearEnd = this.nearEnd()
      if (nearEnd) this.unread = false
      this.jumpButton.hidden = nearEnd
      this.jumpButton.textContent = this.unread ? 'New messages · Jump to latest' : 'Jump to latest'
    }

    private async send() {
      if (!this.options || this.sendButton.disabled) return
      const draft = this.input.value
      const text = draft.trim()
      const revision = this.revision
      const harness = this.options.harness
      const previousMessages = new Set(
        harness.getSnapshot().messages.map(function id(message) {
          return message.id
        })
      )
      const finishFocus = this.trackFocus()
      const focusComposer = this.root.activeElement === this.sendButton
      let errorText: string | undefined
      let failed = false
      this.input.value = ''
      this.sending = true
      this.update()
      if (focusComposer) this.input.focus()
      try {
        const pending = harness.send(text)
        const outcome = await pending
        errorText = outcome.error?.message
        failed = outcome.status !== 'completed'
      } catch (error) {
        failed = true
        if (revision === this.revision)
          errorText = error instanceof Error ? error.message : 'The message could not be sent.'
      } finally {
        const restoreFocus = finishFocus()
        if (revision === this.revision) {
          this.sending = false
          const recorded = harness.getSnapshot().messages.some(function sent(message) {
            return (
              message.role === 'user' && message.text === text && !previousMessages.has(message.id)
            )
          })
          if (failed && !recorded && !this.input.value) this.input.value = draft
          this.update()
          if (errorText) this.status.textContent = errorText
          if (restoreFocus && this.isConnected) this.input.focus()
        }
      }
    }

    private trackFocus() {
      const controls = new Set<EventTarget>([
        this.input,
        this.sendButton,
        this.stopButton,
        this.clearButton
      ])
      let retained = this.root.activeElement !== null && controls.has(this.root.activeElement)
      const document = this.ownerDocument
      const root = this.root
      const trackers = this.focusTrackers
      function moved(event: Event) {
        if (!controls.has(event.composedPath()[0])) retained = false
      }
      document.addEventListener('focusin', moved, true)
      document.addEventListener('pointerdown', moved, true)
      root.addEventListener('focusin', moved)
      function finish() {
        document.removeEventListener('focusin', moved, true)
        document.removeEventListener('pointerdown', moved, true)
        root.removeEventListener('focusin', moved)
        trackers.delete(finish)
        return retained
      }
      trackers.add(finish)
      return finish
    }

    private async perform(action: 'stop' | 'clear') {
      if (!this.options || (action === 'clear' && this.clearButton.disabled)) return
      const revision = this.revision
      const finishFocus = this.trackFocus()
      let errorText: string | undefined
      if (action === 'clear') this.clearing = true
      this.update()
      try {
        await this.options.harness[action]()
      } catch (error) {
        errorText = (error instanceof Error && error.message) || 'The operation failed.'
      } finally {
        const restoreFocus = finishFocus()
        if (revision === this.revision) {
          this.clearing = false
          if (action === 'clear' && !errorText) this.input.value = ''
          this.update()
          if (errorText) this.status.textContent = errorText
          else if (action === 'clear') this.status.textContent = 'New chat started.'
          if (restoreFocus && this.isConnected) this.input.focus()
        }
      }
    }
  }
  customElements.define('webmcp-chat', ChatElement)
}
