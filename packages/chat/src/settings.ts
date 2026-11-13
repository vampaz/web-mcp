import type { WebMCPChatLabels } from './interfaces/chat'
import type { WebMCPChatSettings } from './interfaces/settings'
import { icon } from './icon'

export class ChatSettings {
  private options!: WebMCPChatSettings
  private readonly button = document.createElement('button')
  private readonly region = document.createElement('section')
  private readonly approval: HTMLInputElement
  private readonly closeButton: HTMLButtonElement

  constructor(private readonly panel: HTMLElement) {
    const id = `${panel.id}-settings`
    this.button.type = 'button'
    this.button.className = 'icon-button'
    this.button.setAttribute('part', 'settings-button')
    this.button.setAttribute('aria-controls', id)
    this.button.setAttribute('aria-expanded', 'false')
    this.button.innerHTML = icon(
      'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4'
    )
    this.region.id = id
    this.region.className = 'settings-panel'
    this.region.setAttribute('part', 'settings')
    this.region.setAttribute('aria-labelledby', `${id}-title`)
    this.region.hidden = true
    this.region.innerHTML = `
      <div class="settings-heading"><button type="button" class="icon-button settings-back" data-settings-close>${icon('m15 18-6-6 6-6')}</button><h3 id="${id}-title"></h3></div>
      <div class="settings-body">
        <p class="settings-detail"></p>
        <p class="settings-error" role="alert" hidden></p>
        <fieldset class="settings-card settings-approval-card"><label class="settings-approval"><input type="checkbox" /><span><strong></strong><small></small></span></label></fieldset>
        <slot name="settings"></slot>
      </div>`
    this.approval = this.region.querySelector('input')!
    this.closeButton = this.region.querySelector('button')!
    panel.querySelector('[data-clear]')!.after(this.button)
    panel.querySelector('.conversation')!.before(this.region)
    this.button.addEventListener('click', () => this.setOpen(Boolean(this.region.hidden), true))
    this.closeButton.addEventListener('click', () => this.setOpen(false, true))
    this.approval.addEventListener('change', () => {
      if (!this.options.disabled) this.options.confirmations?.onChange(this.approval.checked)
    })
  }

  configure(options: WebMCPChatSettings, labels: WebMCPChatLabels) {
    this.options = options
    this.button.setAttribute('aria-label', labels.settings)
    this.button.title = labels.settings
    this.closeButton.setAttribute('aria-label', labels.closeSettings)
    this.closeButton.title = labels.closeSettings
    this.region.querySelector('h3')!.textContent = labels.settings
    const detail = this.region.querySelector<HTMLElement>('.settings-detail')!
    detail.textContent = options.detail ?? ''
    detail.hidden = !options.detail
    const card = this.region.querySelector<HTMLFieldSetElement>('.settings-approval-card')!
    card.hidden = !options.confirmations
    card.disabled = Boolean(options.disabled)
    this.approval.checked = options.confirmations?.enabled ?? false
    this.region.querySelector('strong')!.textContent = labels.confirmations
    this.region.querySelector('small')!.textContent = labels.confirmationsHint
    const error = this.region.querySelector<HTMLElement>('.settings-error')!
    error.textContent = options.error ?? ''
    error.hidden = !options.error
  }

  handleKeydown(event: KeyboardEvent) {
    if (this.region.hidden || event.key !== 'Escape' || event.isComposing || event.defaultPrevented)
      return
    event.preventDefault()
    event.stopImmediatePropagation()
    this.setOpen(false, true)
  }

  setOpen(open: boolean, focus = false) {
    this.region.hidden = !open
    this.button.setAttribute('aria-expanded', String(open))
    this.panel.toggleAttribute('data-settings-open', open)
    for (const element of this.panel.querySelectorAll<HTMLElement>('.conversation, .composer'))
      element.hidden = open
    if (focus) (open ? this.closeButton : this.button).focus({ preventScroll: true })
  }

  destroy() {
    const focused =
      (this.panel.getRootNode() as ShadowRoot).activeElement ??
      this.panel.ownerDocument.activeElement
    const restoreFocus =
      focused === this.button ||
      this.region.contains(focused) ||
      this.region
        .querySelector('slot')!
        .assignedElements()
        .some((element) => element.contains(focused))
    this.setOpen(false)
    this.button.remove()
    this.region.remove()
    if (restoreFocus) this.panel.querySelector('textarea')!.focus()
  }
}
