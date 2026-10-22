import type {
  ResolverContext,
  ToolInvocationResult,
  ToolResolution,
  ToolResolver
} from './interfaces/tool'
import type {
  WebMCPCommandErrorEventDetail,
  WebMCPCommandInputConfigureOptions,
  WebMCPCommandInputElement,
  WebMCPCommandInputLabels,
  WebMCPCommandInputResolverOption,
  WebMCPCommandInputPhase,
  WebMCPCommandPanelToggleEventDetail,
  WebMCPCommandResolutionEventDetail,
  WebMCPCommandResolverEventDetail,
  WebMCPCommandResultEventDetail,
  WebMCPCommandStepEventDetail,
  WebMCPCommandInputRunOptions
} from './interfaces/command-input'
import {
  applyCommandInputView,
  createCommandInputDom,
  type CommandInputDom,
  type CommandInputTone,
  type CommandInputViewState
} from './command-input-render'
import {
  commandCancelledMessage,
  invokeResolvedSteps,
  throwIfAborted,
  waitUnlessAborted
} from './command-input-runner'
import { getErrorMessage } from './confirmation'
import {
  getDefaultModelForResolverOption,
  getModelSelectState,
  getProviderSelectState,
  getResolverOptionStatusText,
  sameResolverOptions
} from './command-input-options'
import { createResolver } from './resolver'
import { listAvailableTools } from './registry'
import { validateToolResolution } from './resolution-validation'

type CommandInputConstructor = CustomElementConstructor & {
  observedAttributes: string[]
}

type CommandInputRuntimeState = {
  buttonLabel?: string
  disabled: boolean
  floating: boolean
  floatingExpanded: boolean
  hasDiagnostics: boolean
  diagnosticsOpen: boolean
  label?: string
  labels: Partial<WebMCPCommandInputLabels>
  launcher: boolean
  model: string
  phase: WebMCPCommandInputPhase
  resolverOptionId?: string
  placeholder: string
  prompt: string
  resolverDetail?: string
  resolverName: string
  settingsOpen: boolean
  tone: CommandInputTone
}

const defaultPlaceholder = 'Tell this app what to do'
const defaultLabel = 'Command'
const defaultLabels: WebMCPCommandInputLabels = {
  form: 'WebMCP command input',
  run: 'Run',
  stop: 'Stop',
  launcher: 'Commands',
  options: 'Options',
  provider: 'Provider',
  model: 'Model',
  diagnostics: 'Developer diagnostics',
  idle: 'Resolver is waiting for a command.',
  preparing: 'Preparing...',
  resolving: 'Resolving...',
  executing: 'Running {tool}.',
  cancelled: commandCancelledMessage
}
const supersededResolverRefreshMessage = 'Resolver refresh was superseded.'
const webMCPCommandInputTagName = 'webmcp-command-input'
const observedAttributes = [
  'button-label',
  'disabled',
  'floating',
  'label',
  'launcher',
  'placeholder'
]
// Properties a page may set before the element is defined; they are replayed through setters.
const upgradableProperties = [
  'resolverOptions',
  'resolver',
  'context',
  'buttonLabel',
  'disabled',
  'floating',
  'label',
  'labels',
  'launcher',
  'placeholder',
  'panelOpen'
]

export function defineWebMCPCommandInput(
  tagName = webMCPCommandInputTagName
): CommandInputConstructor {
  assertCustomElementsAvailable()

  const existingConstructor = customElements.get(tagName)
  if (existingConstructor) return existingConstructor as CommandInputConstructor

  class WebMCPCommandInput extends HTMLElement implements WebMCPCommandInputElement {
    static observedAttributes = observedAttributes

    private providedContext?: ResolverContext | (() => ResolverContext)
    private providedResolverOptions?: WebMCPCommandInputResolverOption[]
    private pendingResolver?: Promise<ToolResolver>
    private currentResolver?: ToolResolver
    private isConnectedToDom = false
    private lightDomObserver?: MutationObserver
    private panelOpener?: HTMLElement
    private resolverRevision = 0
    private providedResolver?: ToolResolver
    private running = false
    private activeCommand?: AbortController
    private userSelectedResolver = false
    private readonly dom: CommandInputDom
    private readonly state: CommandInputRuntimeState = {
      disabled: false,
      diagnosticsOpen: false,
      floating: false,
      floatingExpanded: false,
      hasDiagnostics: false,
      labels: {},
      launcher: false,
      model: '',
      phase: 'idle',
      placeholder: defaultPlaceholder,
      prompt: '',
      resolverName: 'Resolver',
      settingsOpen: false,
      tone: 'info'
    }

    constructor() {
      super()
      const root = this.attachShadow({ mode: 'open' })
      this.dom = createCommandInputDom(root)
      root.addEventListener('keydown', this.handleKeyDown.bind(this))
      this.dom.form.addEventListener('submit', this.handleSubmit.bind(this))
      this.dom.input.addEventListener('input', this.handlePromptChanged.bind(this))
      this.dom.run.addEventListener('click', this.handleRunClick.bind(this))
      this.dom.launcher.addEventListener('click', this.handleLauncherClick.bind(this))
      this.dom.settings.addEventListener('toggle', this.handleSettingsToggled.bind(this))
      this.dom.diagnostics.addEventListener('toggle', this.handleDiagnosticsToggled.bind(this))
      this.dom.provider.addEventListener('change', this.handleProviderChanged.bind(this))
      this.dom.model.addEventListener('change', this.handleModelChanged.bind(this))
    }

    connectedCallback() {
      this.syncAttributes()
      this.upgradeProperties()
      this.isConnectedToDom = true
      this.syncDiagnosticsContent()
      this.observeLightDom()
      this.render()
      if (this.state.floatingExpanded) this.focusPromptInput()
      void this.refreshResolverStatus()
    }

    disconnectedCallback() {
      this.isConnectedToDom = false
      this.lightDomObserver?.disconnect()
      this.lightDomObserver = undefined
      // A DOM move disconnects and reconnects synchronously; only a real removal cancels work.
      queueMicrotask(this.invalidateIfDisconnected.bind(this))
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
      if (oldValue === newValue) return
      this.applyAttribute(name, newValue)
      if (!this.isConnectedToDom) return
      this.render()
    }

    get buttonLabel(): string {
      return this.state.buttonLabel || this.labels.run
    }

    set buttonLabel(value: string | undefined) {
      this.state.buttonLabel = value || undefined
      this.renderIfConnected()
    }

    get context(): ResolverContext | (() => ResolverContext) | undefined {
      return this.providedContext
    }

    set context(value: ResolverContext | (() => ResolverContext) | undefined) {
      this.providedContext = value
    }

    get disabled(): boolean {
      return this.state.disabled
    }

    set disabled(value: boolean) {
      this.toggleAttribute('disabled', Boolean(value))
    }

    get floating(): boolean {
      return this.state.floating
    }

    set floating(value: boolean) {
      this.toggleAttribute('floating', Boolean(value))
    }

    get label(): string {
      return this.state.label || defaultLabel
    }

    set label(value: string | undefined) {
      this.state.label = value || undefined
      this.renderIfConnected()
    }

    get labels(): WebMCPCommandInputLabels {
      return { ...defaultLabels, ...this.state.labels }
    }

    set labels(value: Partial<WebMCPCommandInputLabels> | undefined) {
      this.state.labels = { ...value }
      this.renderIfConnected()
    }

    get launcher(): boolean {
      return this.state.launcher
    }

    set launcher(value: boolean) {
      this.toggleAttribute('launcher', Boolean(value))
    }

    get panelOpen(): boolean {
      return this.state.floatingExpanded
    }

    set panelOpen(value: boolean) {
      this.setPanelOpen(value)
    }

    get placeholder(): string {
      return this.state.placeholder
    }

    set placeholder(value: string | undefined) {
      this.applyPlaceholderState(value)
      this.renderIfConnected()
    }

    get resolver(): ToolResolver | undefined {
      return this.providedResolver
    }

    set resolver(value: ToolResolver | undefined) {
      this.configure({ resolver: value })
    }

    get resolverOptions(): WebMCPCommandInputResolverOption[] | undefined {
      return this.providedResolverOptions
    }

    set resolverOptions(value: WebMCPCommandInputResolverOption[] | undefined) {
      this.configure({ resolverOptions: value })
    }

    configure(options: WebMCPCommandInputConfigureOptions) {
      if (options.resolver !== undefined && options.resolverOptions !== undefined)
        throw new Error('Configure either resolver or resolverOptions.')
      if (options.resolverOptions) {
        const ids = options.resolverOptions.map(function id(option) {
          return option.id
        })
        if (
          ids.some(function empty(id) {
            return !id.trim()
          }) ||
          new Set(ids).size !== ids.length
        )
          throw new Error('Resolver choices require unique, nonempty IDs.')
      }
      const previousResolver = this.providedResolver
      const previousOptions = this.providedResolverOptions
      const previousId = this.state.resolverOptionId
      const previousModel = this.state.model
      if ('resolver' in options) {
        this.providedResolver = options.resolver
        this.providedResolverOptions = undefined
      }
      if ('resolverOptions' in options) {
        this.providedResolverOptions = options.resolverOptions
        this.providedResolver = undefined
      }
      const selected = this.getResolverOptionById(this.state.resolverOptionId ?? '')
      if (!selected) {
        this.state.resolverOptionId = this.providedResolverOptions?.[0]?.id
        this.state.model = getDefaultModelForResolverOption(this.getSelectedResolverOption())
      } else if (!selected.modelOptions?.some((option) => option.model === this.state.model)) {
        this.state.model = getDefaultModelForResolverOption(selected)
      }
      if (!this.userSelectedResolver && options.initialResolverOptionId !== undefined) {
        const initial = this.getResolverOptionById(options.initialResolverOptionId)
        if (initial) {
          this.state.resolverOptionId = initial.id
          this.state.model = getDefaultModelForResolverOption(initial)
        }
      }
      if (!this.userSelectedResolver && options.initialModel !== undefined) {
        const model = this.getSelectedResolverOption()?.modelOptions?.find(function matches(item) {
          return item.model === options.initialModel
        })
        if (model) this.state.model = model.model
      }
      if ('context' in options) this.context = options.context
      if (options.floating !== undefined) this.toggleAttribute('floating', options.floating)
      if (options.launcher !== undefined) this.toggleAttribute('launcher', options.launcher)
      if (options.settingsOpen !== undefined) this.state.settingsOpen = options.settingsOpen
      if (options.buttonLabel !== undefined)
        this.state.buttonLabel = options.buttonLabel || undefined
      if (options.disabled !== undefined) this.toggleAttribute('disabled', options.disabled)
      if (options.label !== undefined) this.state.label = options.label || undefined
      if (options.labels !== undefined) this.state.labels = { ...options.labels }
      if (options.placeholder !== undefined) this.applyPlaceholderState(options.placeholder)
      const changed =
        previousResolver !== this.providedResolver ||
        !sameResolverOptions(previousOptions, this.providedResolverOptions) ||
        previousId !== this.state.resolverOptionId ||
        previousModel !== this.state.model
      if (changed) this.invalidateResolver()
      this.renderIfConnected()
      if (changed) void this.refreshResolverStatus()
    }

    openPanel() {
      this.setPanelOpen(true)
    }

    closePanel() {
      this.setPanelOpen(false)
    }

    togglePanel() {
      this.setPanelOpen(!this.state.floatingExpanded)
    }

    async run(
      message?: string,
      options: WebMCPCommandInputRunOptions = {}
    ): Promise<ToolInvocationResult | undefined> {
      if (this.state.floating) {
        this.openPanel()
      }

      const command = (message ?? this.dom.input.value).trim()
      if (this.running || this.disabled || !command) return undefined

      this.state.prompt = command
      this.running = true
      this.setPhase('preparing', this.labels.preparing)
      let signal: AbortSignal | undefined

      try {
        this.invalidateAutoResolverBeforeRun()
        const controller = new AbortController()
        this.activeCommand = controller
        signal = options.signal
          ? AbortSignal.any([controller.signal, options.signal])
          : controller.signal
        const resolver = await waitUnlessAborted(this.getCurrentResolver(), signal)
        const tools = listAvailableTools().map(function mapRegistration(registration) {
          return registration.tool
        })

        this.setPhase('resolving', this.labels.resolving)
        throwIfAborted(signal)
        const resolution = await waitUnlessAborted(
          resolver.resolve(command, tools, this.getResolverContext(), { signal }),
          signal
        )
        throwIfAborted(signal)
        validateToolResolution(resolution, tools)
        this.dispatchResolutionEvent(command, resolution, resolver)
        this.setPhase('executing')

        const result = await invokeResolvedSteps(
          resolution,
          this.setActiveToolName.bind(this),
          (detail) => this.dispatchStepEvent(command, detail),
          signal
        )
        const cancelled = result.code === 'cancelled'
        this.setPhase(
          result.status === 'success' ? 'completed' : 'failed',
          cancelled ? this.labels.cancelled : (result.error ?? resolution.reason),
          getResultTone(result)
        )
        this.dispatchResultEvent(command, resolution, result)
        return result
      } catch (error) {
        const cancelled = signal?.aborted === true
        const errorMessage = cancelled ? commandCancelledMessage : getErrorMessage(error)
        this.setPhase(
          'failed',
          cancelled ? this.labels.cancelled : errorMessage,
          cancelled ? 'info' : 'error'
        )
        this.dispatchErrorEvent(command, errorMessage)
        return {
          toolName: this.state.resolverName,
          status: 'error',
          code: cancelled ? 'cancelled' : 'resolver_failed',
          error: errorMessage,
          durationMs: 0
        }
      } finally {
        this.activeCommand = undefined
        this.running = false
        this.renderIfConnected()
      }
    }

    private syncAttributes() {
      for (const attributeName of observedAttributes) {
        if (this.hasAttribute(attributeName)) {
          this.applyAttribute(attributeName, this.getAttribute(attributeName))
        }
      }
    }

    private upgradeProperties() {
      for (const name of upgradableProperties) {
        if (!Object.prototype.hasOwnProperty.call(this, name)) continue
        const value: unknown = Reflect.get(this, name)
        Reflect.deleteProperty(this, name)
        Reflect.set(this, name, value)
      }
    }

    private invalidateIfDisconnected() {
      if (!this.isConnected) this.invalidateResolver()
    }

    private observeLightDom() {
      this.lightDomObserver?.disconnect()
      this.lightDomObserver = new MutationObserver(this.handleLightDomChanged.bind(this))
      this.lightDomObserver.observe(this, {
        attributeFilter: ['slot'],
        attributes: true,
        childList: true,
        subtree: true
      })
    }

    private handleLightDomChanged() {
      if (this.syncDiagnosticsContent()) this.renderIfConnected()
    }

    private syncDiagnosticsContent(): boolean {
      const hasDiagnostics = this.hasDiagnosticsContent()
      if (this.state.hasDiagnostics === hasDiagnostics) return false
      this.state.hasDiagnostics = hasDiagnostics
      return true
    }

    private hasDiagnosticsContent(): boolean {
      return Boolean(this.querySelector('[slot="diagnostics"]'))
    }

    private applyAttribute(name: string, value: string | null) {
      if (name === 'button-label') this.state.buttonLabel = value || undefined
      if (name === 'disabled') this.state.disabled = value !== null
      if (name === 'floating') this.applyFloatingState(value !== null)
      if (name === 'label') this.state.label = value || undefined
      if (name === 'launcher') this.state.launcher = value !== null
      if (name === 'placeholder') this.applyPlaceholderState(value ?? undefined)
    }

    private applyPlaceholderState(value: string | undefined) {
      this.state.placeholder = value || defaultPlaceholder
    }

    private applyFloatingState(value: boolean) {
      this.state.floating = value
      if (!value) this.state.floatingExpanded = false
    }

    private async getCurrentResolver(): Promise<ToolResolver> {
      if (this.providedResolver) return this.providedResolver
      if (this.currentResolver) return this.currentResolver
      if (this.pendingResolver) return this.pendingResolver
      const revision = this.resolverRevision
      const option = this.getSelectedResolverOption()
      const model = this.state.model
      // Share one creation between status refresh and a command that starts immediately.
      const pending = Promise.resolve()
        .then(async function create() {
          return option
            ? option.createResolver({
                model: model || undefined,
                modelOption: option.modelOptions?.find(function selected(item) {
                  return item.model === model
                })
              })
            : createResolver()
        })
        .then((resolver) => {
          if (revision !== this.resolverRevision) {
            resolver.dispose?.()
            throw new Error(supersededResolverRefreshMessage)
          }
          this.currentResolver = resolver
          return resolver
        })
      this.pendingResolver = pending
      try {
        return await pending
      } finally {
        if (this.pendingResolver === pending) this.pendingResolver = undefined
      }
    }

    private getResolverContext(): ResolverContext {
      const context = this.context
      if (typeof context === 'function') return context()
      return context ?? {}
    }

    private async refreshResolverStatus() {
      if (!this.isConnectedToDom) return

      try {
        const resolver = await this.getCurrentResolver()
        this.state.resolverName = `${resolver.name} (${resolver.status})`
        // A running command owns the status region until it settles.
        if (!this.running) this.setDetail(resolver.detail, 'info')
        this.dispatchResolverEvent(resolver)
      } catch (error) {
        if (getErrorMessage(error) === supersededResolverRefreshMessage) return
        this.state.resolverName = 'Resolver'
        if (!this.running) this.setDetail(getErrorMessage(error), 'error')
      }

      this.renderIfConnected()
    }

    private invalidateResolver() {
      this.activeCommand?.abort()
      this.resolverRevision += 1
      this.pendingResolver = undefined
      this.currentResolver?.dispose?.()
      this.currentResolver = undefined
    }

    private invalidateAutoResolverBeforeRun() {
      if (this.providedResolver || this.getSelectedResolverOption()) return
      // Keep a ready automatic resolver (and its Chrome AI session); retry anything else.
      if (this.currentResolver?.status === 'ready') return
      // A creation already in flight is fresh, so reuse it instead of starting another one.
      if (!this.currentResolver && this.pendingResolver) return
      this.invalidateResolver()
    }

    private setPhase(phase: WebMCPCommandInputPhase, detail?: string, tone?: CommandInputTone) {
      this.state.phase = phase
      if (detail !== undefined) this.setDetail(detail, tone ?? 'info')
      this.renderIfConnected()
    }

    private setDetail(detail: string, tone: CommandInputTone) {
      this.state.resolverDetail = detail
      this.state.tone = tone
    }

    private setActiveToolName(toolName: string) {
      this.setDetail(this.labels.executing.replaceAll('{tool}', toolName), 'info')
      this.renderIfConnected()
    }

    private dispatchResolutionEvent(
      message: string,
      resolution: ToolResolution,
      resolver: ToolResolver
    ) {
      this.dispatchEvent(
        new CustomEvent<WebMCPCommandResolutionEventDetail>('webmcp-command-resolution', {
          bubbles: true,
          composed: true,
          detail: {
            message,
            resolution,
            resolver
          }
        })
      )
    }

    private dispatchResolverEvent(resolver: ToolResolver) {
      this.dispatchEvent(
        new CustomEvent<WebMCPCommandResolverEventDetail>('webmcp-command-resolver', {
          bubbles: true,
          composed: true,
          detail: {
            resolver
          }
        })
      )
    }

    private dispatchResultEvent(
      message: string,
      resolution: ToolResolution,
      result: ToolInvocationResult
    ) {
      this.dispatchEvent(
        new CustomEvent<WebMCPCommandResultEventDetail>('webmcp-command-result', {
          bubbles: true,
          composed: true,
          detail: {
            message,
            resolution,
            result
          }
        })
      )
    }

    private dispatchStepEvent(
      message: string,
      detail: Omit<WebMCPCommandStepEventDetail, 'message'>
    ) {
      this.dispatchEvent(
        new CustomEvent<WebMCPCommandStepEventDetail>('webmcp-command-step', {
          bubbles: true,
          composed: true,
          detail: {
            message,
            ...detail
          }
        })
      )
    }

    private dispatchErrorEvent(message: string, error: string) {
      this.dispatchEvent(
        new CustomEvent<WebMCPCommandErrorEventDetail>('webmcp-command-error', {
          bubbles: true,
          composed: true,
          detail: {
            error,
            message
          }
        })
      )
    }

    private handleSubmit(event: SubmitEvent) {
      event.preventDefault()
      void this.run()
    }

    private handleRunClick(event: MouseEvent) {
      if (!this.activeCommand) return
      event.preventDefault()
      this.activeCommand.abort()
    }

    private handleLauncherClick() {
      this.setPanelOpen(!this.state.floatingExpanded, this.dom.launcher)
    }

    private handleProviderChanged(event: Event) {
      const target = event.target
      if (!(target instanceof HTMLSelectElement)) return
      const option = this.getResolverOptionById(target.value)
      if (!option || option.id === this.state.resolverOptionId) return
      this.userSelectedResolver = true
      this.state.resolverOptionId = option.id
      this.state.model = getDefaultModelForResolverOption(option)
      this.state.settingsOpen = true
      this.invalidateResolver()
      this.render()
      void this.refreshResolverStatus()
    }

    private handleModelChanged(event: Event) {
      const target = event.target
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return
      if (this.state.model === target.value) return
      this.userSelectedResolver = true
      this.state.model = target.value
      this.invalidateResolver()
      void this.refreshResolverStatus()
    }

    private handleSettingsToggled(event: Event) {
      const target = event.target
      if (!(target instanceof HTMLDetailsElement)) return
      this.state.settingsOpen = target.open
    }

    private handleDiagnosticsToggled(event: Event) {
      const target = event.target
      if (!(target instanceof HTMLDetailsElement)) return
      this.state.diagnosticsOpen = target.open
    }

    private handleKeyDown(event: Event) {
      if (!(event instanceof KeyboardEvent) || event.key !== 'Escape' || event.isComposing) return
      // The first Escape stops a running command; the next one closes the floating panel.
      if (this.activeCommand && !this.activeCommand.signal.aborted) {
        event.preventDefault()
        this.activeCommand.abort()
        return
      }
      if (!this.state.floating || !this.state.floatingExpanded) return
      event.preventDefault()
      this.closePanel()
    }

    private setPanelOpen(value: boolean, opener?: HTMLElement) {
      if (this.state.floatingExpanded === value) {
        if (value) this.focusPromptInput()
        return
      }
      const restoreFocus = !value && this.containsFocus()
      if (value) this.panelOpener = opener ?? getDeepActiveElement()
      this.state.floatingExpanded = value
      this.renderIfConnected()
      this.dispatchPanelToggleEvent(value)
      if (value) {
        this.focusPromptInput()
        return
      }
      const panelOpener = this.panelOpener
      this.panelOpener = undefined
      if (!restoreFocus) return
      if (panelOpener?.isConnected) panelOpener.focus()
      else if (this.dom.launcher.isConnected) this.dom.launcher.focus()
    }

    private containsFocus(): boolean {
      const root = this.getRootNode()
      if (!(root instanceof Document) && !(root instanceof ShadowRoot)) return false
      const active = root.activeElement
      return active !== null && this.contains(active)
    }

    private focusPromptInput() {
      this.dom.input.focus()
    }

    private dispatchPanelToggleEvent(open: boolean) {
      this.dispatchEvent(
        new CustomEvent<WebMCPCommandPanelToggleEventDetail>('webmcp-command-panel-toggle', {
          bubbles: true,
          composed: true,
          detail: {
            open
          }
        })
      )
    }

    private handlePromptChanged(event: Event) {
      const target = event.target
      if (!(target instanceof HTMLInputElement)) return
      this.state.prompt = target.value
    }

    private renderIfConnected() {
      if (this.isConnectedToDom) this.render()
    }

    private render() {
      applyCommandInputView(this.dom, this.getViewState())
      this.syncFloatingHost()
    }

    private getViewState(): CommandInputViewState {
      const labels = this.labels
      const resolverOption = this.getSelectedResolverOption()
      const model = this.state.model
      const showProviderControl =
        !this.providedResolver && (this.providedResolverOptions?.length ?? 0) > 1
      const showModelControl =
        !this.providedResolver && (resolverOption?.modelOptions?.length ?? 0) > 1

      return {
        buttonLabel: this.buttonLabel,
        detail: this.state.resolverDetail ?? labels.idle,
        diagnosticsOpen: this.state.diagnosticsOpen,
        disabled: this.state.disabled,
        floating: this.state.floating,
        floatingExpanded: this.state.floatingExpanded,
        label: this.label,
        labels,
        launcher: this.state.launcher,
        model:
          showModelControl && resolverOption
            ? getModelSelectState(resolverOption, model)
            : undefined,
        optionsStatus: resolverOption
          ? getResolverOptionStatusText(resolverOption, model)
          : this.state.resolverName,
        phase: this.state.phase,
        placeholder: this.state.placeholder,
        prompt: this.state.prompt,
        provider: showProviderControl
          ? getProviderSelectState(resolverOption?.id ?? '', this.providedResolverOptions ?? [])
          : undefined,
        running: this.running,
        settingsOpen: this.state.settingsOpen,
        showDiagnostics: this.state.hasDiagnostics,
        tone: this.state.tone
      }
    }

    private getSelectedResolverOption(): WebMCPCommandInputResolverOption | undefined {
      const resolverOptionId = this.state.resolverOptionId
      if (!resolverOptionId) return undefined

      return this.getResolverOptionById(resolverOptionId)
    }

    private getResolverOptionById(
      resolverOptionId: string
    ): WebMCPCommandInputResolverOption | undefined {
      return this.resolverOptions?.find(function findResolverOption(option) {
        return option.id === resolverOptionId
      })
    }

    private syncFloatingHost() {
      this.toggleAttribute('data-floating', this.state.floating)
      this.toggleAttribute(
        'data-floating-expanded',
        this.state.floating && this.state.floatingExpanded
      )
      this.toggleAttribute('data-launcher', this.state.floating && this.state.launcher)
      if (!this.state.floating) {
        this.style.removeProperty('left')
        this.style.removeProperty('top')
        this.style.removeProperty('right')
        this.style.removeProperty('bottom')
      }
    }
  }

  customElements.define(tagName, WebMCPCommandInput)
  return WebMCPCommandInput
}

function getResultTone(result: ToolInvocationResult): CommandInputTone {
  if (result.status === 'success') return 'success'
  if (result.status === 'error' && result.code !== 'cancelled') return 'error'
  return 'info'
}

function getDeepActiveElement(): HTMLElement | undefined {
  let active = document.activeElement
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
  return active instanceof HTMLElement && active !== document.body ? active : undefined
}

function assertCustomElementsAvailable() {
  if (typeof customElements === 'undefined' || typeof HTMLElement === 'undefined') {
    throw new Error(
      'WebMCP command input can only be defined in a browser custom elements environment.'
    )
  }
}
