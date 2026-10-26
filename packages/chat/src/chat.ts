import type { PiController, PiSnapshot } from '@vampaz/webmcp-kit/pi'
import type {
  ChatStatus,
  WebMCPChatElement,
  WebMCPChatLabels,
  WebMCPChatOptions
} from './interfaces/chat'
import { activityText, statusText, updateTranscript } from './render'
import { createLabels } from './labels'
import { chatStyles, popupStyles } from './styles'
import { ChatPopup } from './popup'
import { icon } from './icon'

let instanceCount = 0
const defaultMessageLimit = 16000

export function defineWebMCPChat(): void {
  if (typeof customElements === 'undefined' || customElements.get('webmcp-chat')) return
  class ChatElement extends HTMLElement implements WebMCPChatElement {
    private options?: WebMCPChatOptions
    private labels: WebMCPChatLabels = createLabels()
    private unsubscribe?: () => void
    private snapshot: PiSnapshot = { state: 'loading', messages: [] }
    private revision = 0
    private sending = false
    private clearing = false
    private initiallyScrolled = false
    private latestId?: string
    private latestText?: string
    private activity = ''
    private notice?: ChatStatus
    private unread = false
    private readonly focusTrackers = new Set<() => boolean>()
    private readonly coarsePointer = matchMedia('(pointer: coarse)')
    private readonly root = this.attachShadow({ mode: 'open' })
    private readonly resizeObserver = new ResizeObserver(() => {
      if (!this.initiallyScrolled) this.update()
      else {
        if (this.nearEnd()) this.scrollToEnd()
        this.updateJump()
      }
    })
    private readonly instanceId = `webmcp-chat-${++instanceCount}`
    private readonly status: HTMLParagraphElement
    private readonly statusText: HTMLSpanElement
    private readonly transcript: HTMLDivElement
    private readonly list: HTMLOListElement
    private readonly empty: HTMLDivElement
    private readonly emptyText: HTMLParagraphElement
    private readonly working: HTMLParagraphElement
    private readonly workingText: HTMLSpanElement
    private readonly announcer: HTMLParagraphElement
    private readonly heading: HTMLHeadingElement
    private readonly messageLabel: HTMLLabelElement
    private readonly input: HTMLTextAreaElement
    private readonly sendButton: HTMLButtonElement
    private readonly stopButton: HTMLButtonElement
    private readonly stopText: HTMLSpanElement
    private readonly clearButton: HTMLButtonElement
    private readonly editButton: HTMLButtonElement
    private readonly suggestions: HTMLDivElement
    private readonly hint: HTMLParagraphElement
    private readonly limit: HTMLParagraphElement
    private readonly jumpButton: HTMLButtonElement
    private readonly popup: ChatPopup

    constructor() {
      super()
      const id = this.instanceId
      this.root.innerHTML = `<style>${chatStyles}${popupStyles}</style>
        <div class="presentation">
        <section class="panel" part="panel" id="${id}-panel" aria-labelledby="${id}-title">
          <header part="header">
            <div class="identity"><span class="assistant-mark">${icon('M5 5h14v11H10l-5 4V5M9 9h6M9 12h4')}</span><h2 id="${id}-title" part="title"></h2></div>
            <div class="header-actions"><slot name="header-actions"></slot><button class="icon-button" type="button" data-clear part="new-chat">${icon('M12 5v14M5 12h14')}</button></div>
          </header>
          <div class="conversation">
            <div class="transcript" part="transcript" tabindex="0" role="log"><div data-empty><slot name="empty"><p></p></slot></div><ol></ol><p class="working" hidden aria-hidden="true"><span class="working-dots"><span></span><span></span><span></span></span><span class="working-text"></span></p></div>
            <p class="visually-hidden" aria-live="polite" data-activity></p>
            <button type="button" class="jump-latest" part="jump-latest" hidden></button>
          </div>
          <form class="composer" part="composer">
            <div class="suggestions"></div>
            <div class="message-box">
              <label class="visually-hidden" for="${id}-message"></label>
              <textarea id="${id}-message" part="textarea" rows="2" enterkeyhint="send"></textarea>
              <div class="actions"><button type="button" data-stop part="stop">${icon('M7 7h10v10H7z')}<span></span></button><button class="send icon-button" type="submit" part="send">${icon('M12 19V5M6 11l6-6 6 6')}</button></div>
            </div>
            <div class="composer-meta"><p class="status" part="status" role="status" aria-live="polite">${icon('M12 8v5M12 16h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0')}<span></span></p><button type="button" data-edit-last hidden></button><p class="hint" id="${id}-hint"></p></div>
            <p class="limit" id="${id}-limit" hidden></p>
            <slot name="footer"></slot>
          </form>
        </section>
        </div>`
      this.heading = this.root.querySelector('h2')!
      this.status = this.root.querySelector('.status')!
      this.statusText = this.root.querySelector('.status span')!
      this.transcript = this.root.querySelector('.transcript')!
      this.list = this.root.querySelector('ol')!
      this.empty = this.root.querySelector('[data-empty]')!
      this.emptyText = this.root.querySelector('[data-empty] p')!
      this.working = this.root.querySelector('.working')!
      this.workingText = this.root.querySelector('.working-text')!
      this.announcer = this.root.querySelector('[data-activity]')!
      this.messageLabel = this.root.querySelector('label')!
      this.input = this.root.querySelector('textarea')!
      this.sendButton = this.root.querySelector('[type=submit]')!
      this.stopButton = this.root.querySelector('[data-stop]')!
      this.stopText = this.root.querySelector('[data-stop] span')!
      this.clearButton = this.root.querySelector('[data-clear]')!
      this.editButton = this.root.querySelector('[data-edit-last]')!
      this.suggestions = this.root.querySelector('.suggestions')!
      this.hint = this.root.querySelector('.hint')!
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
        // Touch keyboards keep Enter for new lines; the Send button submits.
        if (
          event.key === 'Enter' &&
          !event.shiftKey &&
          !event.isComposing &&
          !this.coarsePointer.matches
        ) {
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
      this.editButton.addEventListener('click', () => {
        const text = this.lastUserText()
        if (text === undefined) return
        this.setDraft(text)
        this.input.focus()
        this.input.setSelectionRange(text.length, text.length)
      })
      this.transcript.addEventListener('scroll', () => this.updateJump())
      this.jumpButton.addEventListener('click', () => {
        this.scrollToEnd()
        this.transcript.focus({ preventScroll: true })
        this.updateJump()
      })
      this.applyLabels()
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

    get controller(): PiController | undefined {
      return this.options?.controller
    }
    set controller(controller: PiController) {
      this.configure({ ...this.options, controller })
    }

    open() {
      this.popup.setOpen(true)
    }
    close() {
      this.popup.setOpen(false)
    }
    toggle() {
      this.popup.toggle()
    }
    focusComposer() {
      if (this.dataset.mode === 'popup' && !this.popup.isOpen) this.popup.setOpen(true)
      else this.input.focus()
    }
    setDraft(text: string) {
      this.input.value = text
      this.updateComposer()
    }

    configure(options: WebMCPChatOptions) {
      if (!options?.controller) throw new Error('Configure a conversation controller.')
      if (this.options?.controller !== options.controller) {
        this.input.value = ''
        this.list.replaceChildren()
        this.snapshot = options.controller.getSnapshot()
        this.initiallyScrolled = false
        this.latestId = this.latestText = undefined
        this.notice = undefined
        this.unread = false
        this.revision++
        this.sending = false
        this.clearing = false
        for (const finish of this.focusTrackers) finish()
      }
      this.unsubscribe?.()
      this.unsubscribe = undefined
      this.options = { ...options }
      this.labels = createLabels(options.labels, options.locale)
      this.dataset.theme = options.theme ?? 'light'
      this.heading.textContent = options.title ?? 'Assistant'
      this.popup.configure(
        options.mode ?? 'inline',
        this.heading.textContent,
        this.labels,
        options.placement ?? 'end'
      )
      this.applyLabels()
      this.input.placeholder = options.placeholder ?? 'Ask the assistant'
      this.emptyText.textContent =
        options.emptyState ?? 'Ask a question or choose a suggestion to start.'
      this.suggestions.replaceChildren()
      for (const prompt of options.suggestedPrompts ?? []) {
        const button = document.createElement('button')
        button.type = 'button'
        button.setAttribute('part', 'suggestion')
        button.textContent = prompt
        button.addEventListener('click', () => {
          this.setDraft(prompt)
          this.input.focus()
        })
        this.suggestions.append(button)
      }
      if (this.isConnected) this.connect()
      this.update()
    }

    private applyLabels() {
      const labels = this.labels
      this.clearButton.setAttribute('aria-label', labels.newChat)
      this.clearButton.title = labels.newChat
      this.sendButton.setAttribute('aria-label', labels.send)
      this.sendButton.title = labels.send
      this.stopText.textContent = labels.stop
      this.transcript.setAttribute('aria-label', labels.conversation)
      this.messageLabel.textContent = labels.message
      this.hint.textContent = labels.hint
      this.editButton.textContent = labels.editLastMessage
    }

    private connect() {
      this.unsubscribe?.()
      if (this.options)
        this.unsubscribe = this.options.controller.subscribe((snapshot) => this.update(snapshot))
    }

    private update(snapshot = this.snapshot) {
      const stateChanged = snapshot.state !== this.snapshot.state
      this.snapshot = snapshot
      const nearEnd = this.nearEnd()
      const latest = snapshot.messages.at(-1)
      if ((latest?.id !== this.latestId || latest?.text !== this.latestText) && !nearEnd)
        this.unread = true
      this.latestId = latest?.id
      this.latestText = latest?.text
      let changed = updateTranscript(
        this.list,
        snapshot.messages,
        this.options?.assistantLabel ?? 'Assistant',
        this.labels,
        this.options?.renderMessage
      )
      // Operation notices describe the conversation they followed; drop them once it changes.
      if (stateChanged || changed) this.notice = undefined
      const working = this.isWorking()
      this.empty.hidden = snapshot.messages.length > 0 || working
      if (this.working.hidden === working) {
        this.working.hidden = !working
        changed = true
      }
      const activity = working ? activityText(snapshot.activity, this.labels) : ''
      if (activity !== this.activity) {
        this.activity = activity
        this.workingText.textContent = activity
        this.announcer.textContent = activity
        changed = true
      }
      const busy = String(this.isBusy())
      if (this.list.getAttribute('aria-busy') !== busy) this.list.setAttribute('aria-busy', busy)
      this.updateStatus()
      this.updateComposer()
      if (this.isConnected && (!this.initiallyScrolled || (changed && nearEnd))) {
        this.scrollToEnd()
        this.initiallyScrolled = snapshot.state !== 'loading' && this.transcript.clientHeight > 0
      }
      this.updateJump()
    }

    private updateStatus() {
      const status: ChatStatus = this.clearing
        ? { text: this.labels.status.startingNewChat }
        : (this.notice ??
          (this.isWorking() && !this.snapshot.error
            ? { text: '' }
            : statusText(this.snapshot, this.labels)))
      if (this.statusText.textContent !== status.text) this.statusText.textContent = status.text
      if (status.tone) this.status.dataset.tone = status.tone
      else delete this.status.dataset.tone
    }

    private showNotice(text: string, tone?: ChatStatus['tone']) {
      this.notice = { text, tone }
      this.updateStatus()
    }

    private updateComposer() {
      const snapshot = this.snapshot
      const length = this.input.value.length
      const max = this.options?.maxMessageLength ?? defaultMessageLimit
      const busy = this.isBusy()
      const disabled = !this.options || this.options.disabled || snapshot.state === 'closed'
      const tooLong = length > max
      const coarse = this.coarsePointer.matches
      this.suggestions.hidden = snapshot.messages.length > 0 || length > 0
      this.input.disabled = Boolean(disabled || this.clearing || snapshot.state === 'loading')
      this.input.setAttribute('aria-invalid', String(tooLong))
      this.limit.hidden = length < max * 0.9
      if (!this.limit.hidden)
        this.limit.textContent = tooLong
          ? this.labels.tooLong(length, max)
          : this.labels.characterCount(length, max)
      // Describe only visible help, so screen readers skip the hidden limit and touch hint.
      const describedBy = [coarse ? '' : this.hint.id, this.limit.hidden ? '' : this.limit.id]
        .filter(Boolean)
        .join(' ')
      if ((this.input.getAttribute('aria-describedby') ?? '') !== describedBy) {
        if (describedBy) this.input.setAttribute('aria-describedby', describedBy)
        else this.input.removeAttribute('aria-describedby')
      }
      const enterKey = coarse ? 'enter' : 'send'
      if (this.input.getAttribute('enterkeyhint') !== enterKey)
        this.input.setAttribute('enterkeyhint', enterKey)
      this.sendButton.disabled = Boolean(disabled || busy || tooLong || !this.input.value.trim())
      this.stopButton.disabled = Boolean(disabled || snapshot.state !== 'running')
      this.stopButton.hidden = !['running', 'stopping'].includes(snapshot.state)
      this.clearButton.disabled = Boolean(
        disabled ||
        busy ||
        (!snapshot.messages.length && !length && !['error', 'interrupted'].includes(snapshot.state))
      )
      this.editButton.hidden = !this.turnFailed() || length > 0 || this.lastUserText() === undefined
      this.editButton.disabled = Boolean(disabled || this.clearing)
      for (const button of this.suggestions.querySelectorAll('button'))
        button.disabled = Boolean(disabled || busy)
    }

    private isWorking() {
      const state = this.snapshot.state
      if (state === 'running' || state === 'stopping') return true
      if (state === 'interrupted' || state === 'error' || state === 'closed') return false
      return this.sending
    }

    private isBusy() {
      return (
        this.sending ||
        this.clearing ||
        ['running', 'stopping', 'loading'].includes(this.snapshot.state)
      )
    }

    private turnFailed() {
      const { state, error, messages } = this.snapshot
      if (this.isWorking()) return false
      return (
        state === 'interrupted' ||
        state === 'error' ||
        (state === 'idle' && Boolean(error || messages.at(-1)?.failed))
      )
    }

    private lastUserText() {
      const messages = this.snapshot.messages
      for (let index = messages.length - 1; index >= 0; index--)
        if (messages[index].role === 'user') return messages[index].text
      return undefined
    }

    private nearEnd() {
      return (
        this.transcript.scrollHeight - this.transcript.scrollTop - this.transcript.clientHeight < 64
      )
    }

    private scrollToEnd() {
      this.transcript.scrollTop = this.transcript.scrollHeight
    }

    private updateJump() {
      const nearEnd = this.nearEnd()
      if (nearEnd) this.unread = false
      this.jumpButton.hidden = nearEnd
      const text = this.unread ? this.labels.newMessages : this.labels.jumpToLatest
      if (this.jumpButton.textContent !== text) this.jumpButton.textContent = text
    }

    private async send() {
      if (!this.options || this.sendButton.disabled) return
      const draft = this.input.value
      const text = draft.trim()
      const revision = this.revision
      const controller = this.options.controller
      const previousMessages = new Set(
        this.snapshot.messages.map(function id(message) {
          return message.id
        })
      )
      const finishFocus = this.trackFocus()
      const focusComposer = this.root.activeElement === this.sendButton
      let errorText: string | undefined
      let failed = false
      this.input.value = ''
      this.sending = true
      this.notice = undefined
      this.update()
      if (focusComposer) this.input.focus()
      this.dispatchEvent(
        new CustomEvent('webmcp-chat-send', { detail: { text }, bubbles: true, composed: true })
      )
      try {
        const outcome = await controller.send(text)
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
          const recorded = this.snapshot.messages.some(function sent(message) {
            return (
              message.role === 'user' && message.text === text && !previousMessages.has(message.id)
            )
          })
          if (failed && !recorded && !this.input.value) this.input.value = draft
          this.update()
          if (errorText) this.showNotice(errorText, 'error')
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
      if (action === 'clear') {
        this.clearing = true
        this.notice = undefined
      }
      this.update()
      try {
        await this.options.controller[action]()
      } catch (error) {
        errorText = (error instanceof Error && error.message) || 'The operation failed.'
      } finally {
        const restoreFocus = finishFocus()
        if (revision === this.revision) {
          this.clearing = false
          if (action === 'clear' && !errorText) this.input.value = ''
          this.update()
          if (errorText) this.showNotice(errorText, 'error')
          else if (action === 'clear') this.showNotice(this.labels.status.newChatStarted)
          if (restoreFocus && this.isConnected) this.input.focus()
        }
      }
    }
  }
  customElements.define('webmcp-chat', ChatElement)
}
