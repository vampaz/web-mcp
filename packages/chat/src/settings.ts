import type { WebMCPChatLabels } from './interfaces/chat'
import type { WebMCPChatSettings } from './interfaces/settings'
import { icon } from './icon'

export class ChatSettings {
  private options!: WebMCPChatSettings
  private readonly button = document.createElement('button')
  private readonly region = document.createElement('section')
  private readonly provider: HTMLSelectElement
  private readonly model: HTMLSelectElement
  private readonly approval: HTMLInputElement
  private readonly closeButton: HTMLButtonElement

  constructor(private readonly panel: HTMLElement) {
    const id = `${panel.id}-settings`
    this.button.type = 'button'
    this.button.className = 'icon-button'
    this.button.setAttribute('part', 'settings-button')
    this.button.setAttribute('aria-controls', id)
    this.button.setAttribute('aria-expanded', 'false')
    this.button.innerHTML = icon('M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6')
    this.region.id = id
    this.region.className = 'settings-panel'
    this.region.setAttribute('part', 'settings')
    this.region.setAttribute('aria-labelledby', `${id}-title`)
    this.region.hidden = true
    this.region.innerHTML = `
      <div class="settings-heading"><h3 id="${id}-title"></h3><button type="button" class="icon-button" data-settings-close>${icon('M6 6l12 12M18 6 6 18')}</button></div>
      <fieldset><legend></legend>
        <label for="${id}-provider" data-provider-label></label><select id="${id}-provider"></select>
        <label for="${id}-model" data-model-label></label><select id="${id}-model"></select>
        <p class="settings-detail" id="${id}-detail"></p>
        <label class="settings-approval"><input type="checkbox" /><span><strong></strong><small></small></span></label>
      </fieldset>
      <p class="settings-error" role="alert" hidden></p>
      <slot name="settings"></slot>`
    this.provider = this.region.querySelector(`#${id}-provider`)!
    this.model = this.region.querySelector(`#${id}-model`)!
    this.approval = this.region.querySelector('input')!
    this.closeButton = this.region.querySelector('button')!
    this.provider.setAttribute('aria-describedby', `${id}-detail`)
    this.model.setAttribute('aria-describedby', `${id}-detail`)
    panel.querySelector('.header-actions')!.prepend(this.button)
    panel.querySelector('.conversation')!.before(this.region)
    this.button.addEventListener('click', () => this.setOpen(Boolean(this.region.hidden), true))
    this.closeButton.addEventListener('click', () => this.setOpen(false, true))
    this.provider.addEventListener('change', () => {
      const provider = this.options.providers.find((item) => item.id === this.provider.value)
      if (provider && !this.options.disabled)
        this.options.onChange(provider.id, provider.models[0]?.model)
    })
    this.model.addEventListener('change', () => {
      if (!this.options.disabled) this.options.onChange(this.options.providerId, this.model.value)
    })
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
    this.region.querySelector('legend')!.textContent = labels.conversationModel
    this.region.querySelector('[data-provider-label]')!.textContent = labels.provider
    const modelLabel = this.region.querySelector<HTMLElement>('[data-model-label]')!
    modelLabel.textContent = labels.model
    updateOptions(
      this.provider,
      options.providers.map((item) => ({ value: item.id, label: item.label }))
    )
    this.provider.value = options.providerId
    const provider = options.providers.find((item) => item.id === options.providerId)
    updateOptions(
      this.model,
      (provider?.models ?? []).map((item) => ({ value: item.model, label: item.label }))
    )
    this.model.value = options.model ?? ''
    this.model.hidden = modelLabel.hidden = !provider?.models.length
    this.region.querySelector('fieldset')!.disabled = Boolean(options.disabled)
    this.region.querySelector('.settings-detail')!.textContent = options.detail ?? ''
    this.region.querySelector<HTMLElement>('.settings-approval')!.hidden = !options.confirmations
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

function updateOptions(
  select: HTMLSelectElement,
  options: readonly { value: string; label: string }[]
) {
  if (
    select.options.length === options.length &&
    options.every(
      (option, index) =>
        select.options[index].value === option.value &&
        select.options[index].textContent === option.label
    )
  )
    return
  select.replaceChildren(
    ...options.map(function option(item) {
      return new Option(item.label, item.value)
    })
  )
}
