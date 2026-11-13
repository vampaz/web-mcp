import type { WebMCPChatLabels } from './interfaces/chat'
import type { WebMCPChatProviderIcon, WebMCPChatSettings } from './interfaces/settings'
import { icon } from './icon'

const searchThreshold = 8
const providerIcons: Record<WebMCPChatProviderIcon | 'default', string> = {
  cloud: 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z',
  route:
    'M6 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15M18 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  server: 'M4 3h16v7H4zM4 14h16v7H4zM8 6.5h.01M8 17.5h.01',
  chip: 'M6 6h12v12H6zM10 10h4v4h-4zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4',
  default: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z'
}
const chevronIcon = 'm6 9 6 6 6-6'
const checkIcon = 'M20 6 9 17l-5-5'
const searchIcon = 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4'

interface PickerOption {
  element: HTMLElement
  providerId: string
  model?: string
  text: string
}

/** Composer button and listbox for choosing the conversation model. */
export class ChatModelPicker {
  private options!: WebMCPChatSettings
  private labels!: WebMCPChatLabels
  private readonly button = document.createElement('button')
  private readonly buttonText = document.createElement('span')
  private readonly popover = document.createElement('div')
  private readonly search = document.createElement('input')
  private readonly searchRow = document.createElement('div')
  private readonly listbox = document.createElement('div')
  private readonly empty = document.createElement('p')
  private readonly note = document.createElement('p')
  private items: PickerOption[] = []
  private active = -1
  private signature = ''
  private readonly id: string

  constructor(private readonly panel: HTMLElement) {
    this.id = `${panel.id}-models`
    this.button.type = 'button'
    this.button.className = 'model-button'
    this.button.setAttribute('part', 'model-button')
    this.button.setAttribute('aria-haspopup', 'listbox')
    this.button.setAttribute('aria-expanded', 'false')
    this.button.setAttribute('aria-controls', `${this.id}-list`)
    this.button.innerHTML = icon(providerIcons.default)
    this.button.append(this.buttonText)
    this.button.insertAdjacentHTML('beforeend', icon(chevronIcon))
    this.popover.className = 'model-picker'
    this.popover.setAttribute('part', 'model-picker')
    this.popover.hidden = true
    this.searchRow.className = 'model-search'
    this.searchRow.innerHTML = icon(searchIcon)
    this.search.type = 'search'
    this.search.autocomplete = 'off'
    this.search.spellcheck = false
    this.search.setAttribute('role', 'combobox')
    this.search.setAttribute('aria-expanded', 'true')
    this.search.setAttribute('aria-autocomplete', 'list')
    this.search.setAttribute('aria-controls', `${this.id}-list`)
    this.searchRow.append(this.search)
    this.listbox.id = `${this.id}-list`
    this.listbox.className = 'model-list'
    this.listbox.setAttribute('role', 'listbox')
    this.listbox.tabIndex = 0
    this.empty.className = 'model-empty'
    this.empty.hidden = true
    this.note.className = 'model-note'
    this.popover.append(this.searchRow, this.listbox, this.empty, this.note)
    panel.querySelector('.composer-tools')!.append(this.button)
    panel.querySelector('.message-box')!.append(this.popover)
    this.button.addEventListener('click', () => {
      if (this.popover.hidden) this.open()
      else this.close(true)
    })
    this.search.addEventListener('input', () => this.filter())
    for (const target of [this.search, this.listbox])
      target.addEventListener('keydown', (event) => this.keydown(event))
    this.listbox.addEventListener('click', (event) => {
      const element = (event.target as Element).closest<HTMLElement>('[role=option]')
      const index = this.items.findIndex((item) => item.element === element)
      if (index >= 0) this.choose(index)
    })
    this.popover.addEventListener('focusout', (event) => {
      const next = event.relatedTarget as Node | null
      if (next && !this.popover.contains(next) && next !== this.button) this.close(false)
    })
  }

  get isOpen() {
    return !this.popover.hidden
  }

  configure(options: WebMCPChatSettings, labels: WebMCPChatLabels) {
    this.options = options
    this.labels = labels
    const provider = options.providers.find((item) => item.id === options.providerId)
    const model = provider?.models.find((item) => item.model === options.model)
    const label = model?.label ?? provider?.label ?? options.providerId
    this.buttonText.textContent = label
    this.button.setAttribute('aria-label', labels.chooseModel(label))
    this.button.disabled = Boolean(options.disabled)
    this.search.placeholder = labels.searchModels
    this.search.setAttribute('aria-label', labels.searchModels)
    this.listbox.setAttribute('aria-label', labels.model)
    this.empty.textContent = labels.noModelsMatch
    const note = [options.detail, options.error].filter(Boolean).join(' ')
    this.note.textContent = note
    this.note.hidden = !note
    this.note.toggleAttribute('data-error', Boolean(options.error))
    const signature = JSON.stringify([
      options.providers,
      options.providerId,
      options.model,
      Boolean(options.disabled)
    ])
    if (signature !== this.signature) {
      this.signature = signature
      this.build()
    }
    if (options.disabled && this.isOpen) this.close(true)
  }

  open() {
    if (!this.options || this.options.disabled) return
    this.popover.hidden = false
    this.button.setAttribute('aria-expanded', 'true')
    this.search.value = ''
    this.filter()
    this.fit()
    const selected = this.items.findIndex(
      (item) => item.element.getAttribute('aria-selected') === 'true'
    )
    this.setActive(selected >= 0 ? selected : (this.visible()[0] ?? -1))
    ;(this.searchRow.hidden ? this.listbox : this.search).focus({ preventScroll: true })
    this.panel.ownerDocument.addEventListener('pointerdown', this.outside, true)
  }

  close(focusButton: boolean) {
    if (this.popover.hidden) return
    this.popover.hidden = true
    this.button.setAttribute('aria-expanded', 'false')
    this.panel.ownerDocument.removeEventListener('pointerdown', this.outside, true)
    if (focusButton) this.button.focus({ preventScroll: true })
  }

  /** Handles Escape before the chat's other Escape behaviors. */
  handleKeydown(event: KeyboardEvent) {
    if (!this.isOpen || event.key !== 'Escape' || event.isComposing || event.defaultPrevented)
      return
    event.preventDefault()
    event.stopImmediatePropagation()
    this.close(true)
  }

  destroy() {
    const root = this.panel.getRootNode() as ShadowRoot
    const focused = root.activeElement === this.button || this.popover.contains(root.activeElement)
    this.close(false)
    this.button.remove()
    this.popover.remove()
    if (focused) this.panel.querySelector('textarea')!.focus()
  }

  private readonly outside = (event: Event) => {
    const path = event.composedPath()
    if (!path.includes(this.popover) && !path.includes(this.button)) this.close(false)
  }

  private build() {
    const options = this.options
    this.items = []
    const groups: HTMLElement[] = []
    let count = 0
    for (const [groupIndex, provider] of options.providers.entries()) {
      const group = document.createElement('div')
      group.setAttribute('role', 'group')
      const heading = document.createElement('div')
      heading.className = 'model-group'
      heading.id = `${this.id}-group-${groupIndex}`
      heading.textContent = provider.label
      if (provider.description) {
        const description = document.createElement('span')
        description.textContent = provider.description
        heading.append(description)
      }
      // A provider without models is one option named after it; keep its heading for screen readers only.
      if (!provider.models.length) heading.classList.add('visually-hidden')
      group.setAttribute('aria-labelledby', heading.id)
      group.append(heading)
      const entries = provider.models.length
        ? provider.models.map((model) => ({
            label: model.label,
            detail: model.detail,
            badge: model.badge,
            model: model.model as string | undefined
          }))
        : [
            {
              label: provider.label,
              detail: provider.detail,
              badge: provider.badge,
              model: undefined
            }
          ]
      for (const entry of entries) {
        const element = document.createElement('div')
        element.id = `${this.id}-option-${count++}`
        element.className = 'model-option'
        element.setAttribute('role', 'option')
        element.dataset.provider = provider.id
        if (entry.model !== undefined) element.dataset.model = entry.model
        const selected =
          provider.id === options.providerId &&
          (entry.model === undefined || entry.model === options.model)
        element.setAttribute('aria-selected', String(selected))
        if (options.disabled) element.setAttribute('aria-disabled', 'true')
        const tile = document.createElement('span')
        tile.className = 'model-tile'
        tile.innerHTML = icon(providerIcons[provider.icon ?? 'default'])
        const text = document.createElement('span')
        text.className = 'model-text'
        const name = document.createElement('span')
        name.className = 'model-name'
        name.textContent = entry.label
        text.append(name)
        if (entry.detail) {
          const detail = document.createElement('span')
          detail.className = 'model-detail'
          detail.textContent = entry.detail
          text.append(detail)
        }
        element.append(tile, text)
        if (entry.badge) {
          const badge = document.createElement('span')
          badge.className = 'model-badge'
          badge.textContent = entry.badge
          element.append(badge)
        }
        element.insertAdjacentHTML(
          'beforeend',
          icon(checkIcon).replace('<svg', '<svg class="model-check"')
        )
        group.append(element)
        this.items.push({
          element,
          providerId: provider.id,
          model: entry.model,
          text: [provider.label, entry.label, entry.detail ?? ''].join(' ').toLocaleLowerCase()
        })
      }
      groups.push(group)
    }
    this.listbox.replaceChildren(...groups)
    this.searchRow.hidden = this.items.length <= searchThreshold
    this.active = -1
    if (this.isOpen) this.filter()
  }

  private filter() {
    const query = this.search.value.trim().toLocaleLowerCase()
    for (const item of this.items)
      item.element.hidden = Boolean(query) && !item.text.includes(query)
    for (const group of this.listbox.children)
      (group as HTMLElement).hidden = !group.querySelector('[role=option]:not([hidden])')
    const visible = this.visible()
    this.empty.hidden = visible.length > 0
    if (!visible.includes(this.active)) this.setActive(visible[0] ?? -1)
  }

  private visible() {
    return this.items.flatMap((item, index) => (item.element.hidden ? [] : [index]))
  }

  private setActive(index: number) {
    this.items[this.active]?.element.removeAttribute('data-active')
    this.active = index
    const item = this.items[index]
    for (const target of [this.search, this.listbox]) {
      if (item) target.setAttribute('aria-activedescendant', item.element.id)
      else target.removeAttribute('aria-activedescendant')
    }
    if (!item) return
    item.element.setAttribute('data-active', '')
    item.element.scrollIntoView?.({ block: 'nearest' })
  }

  private keydown(event: KeyboardEvent) {
    if (event.isComposing) return
    const visible = this.visible()
    const position = visible.indexOf(this.active)
    let next: number | undefined
    if (event.key === 'ArrowDown') next = visible[Math.min(position + 1, visible.length - 1)]
    else if (event.key === 'ArrowUp') next = visible[Math.max(position - 1, 0)]
    else if (event.key === 'Home' && event.currentTarget === this.listbox) next = visible[0]
    else if (event.key === 'End' && event.currentTarget === this.listbox) next = visible.at(-1)
    else if (event.key === 'Enter') {
      event.preventDefault()
      if (this.active >= 0) this.choose(this.active)
      return
    } else if (event.key === 'Tab') {
      this.close(false)
      return
    } else return
    event.preventDefault()
    if (next !== undefined) this.setActive(next)
  }

  private choose(index: number) {
    const item = this.items[index]
    if (!item || this.options.disabled) return
    const current =
      item.providerId === this.options.providerId &&
      (item.model === undefined || item.model === this.options.model)
    this.close(true)
    if (!current) this.options.onChange(item.providerId, item.model)
  }

  /** Keeps the list inside the panel above the composer; it may cover the header. */
  private fit() {
    const panel = this.panel.getBoundingClientRect()
    const box = this.panel.querySelector('.message-box')!.getBoundingClientRect()
    const available = box.top - Math.max(panel.top, 0) - 16
    if (available > 0) this.popover.style.maxBlockSize = `${Math.round(available)}px`
  }
}
