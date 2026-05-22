import type {
  PlannerContext,
  PlannerProviderConfig,
  PlannerProviderKind,
  ToolInvocationResult,
  ToolPlan,
  ToolPlanStep,
  ToolPlanner
} from './interfaces/tool'
import type {
  WebMCPCommandErrorEventDetail,
  WebMCPCommandInputConfigureOptions,
  WebMCPCommandInputElement,
  WebMCPCommandInputEndpointOption,
  WebMCPCommandInputPhase,
  WebMCPCommandPlanEventDetail,
  WebMCPCommandPlannerEventDetail,
  WebMCPCommandResultEventDetail
} from './interfaces/command-input'
import { escapeAttribute, escapeHtml } from './command-input-html'
import { getErrorMessage } from './confirmation'
import {
  createCommandInputPlanner,
  defaultEndpoint,
  defaultModel,
  getDefaultProvider,
  getDefaultModelForProvider,
  getModelControlMarkup,
  getModelOptionCount,
  getOptionsStatusText,
  getProviderControlMarkup,
  getProviderOptionCount,
  isAuthMode,
  isPlannerAttribute,
  isPlannerProviderKind
} from './command-input-options'
import { getStyles } from './command-input-styles'
import { createChromeAIPlanner } from './planner'
import { invokeTool, listTools } from './registry'

type CommandInputConstructor = CustomElementConstructor & {
  observedAttributes: string[]
}

type CommandInputRuntimeState = {
  buttonLabel: string
  disabled: boolean
  fixedModel?: string
  fixedProvider?: PlannerProviderKind
  floating: boolean
  floatingExpanded: boolean
  hasDiagnostics: boolean
  diagnosticsOpen: boolean
  model: string
  phase: WebMCPCommandInputPhase
  placeholder: string
  prompt: string
  plannerDetail: string
  plannerName: string
  provider: PlannerProviderKind
  settingsOpen: boolean
}

type FloatingDragState = {
  hasMoved: boolean
  offsetX: number
  offsetY: number
  pointerId: number
}

type FloatingPlacement = {
  horizontal: 'left' | 'right'
  vertical: 'down' | 'up'
}

const defaultPlaceholder = 'Tell this app what to do'
const defaultButtonLabel = 'Run'
const supersededPlannerRefreshMessage = 'Planner refresh was superseded.'
const webMCPCommandInputTagName = 'webmcp-command-input'
const observedAttributes = [
  'account-id',
  'api-key',
  'auth-mode',
  'base-url',
  'button-label',
  'disabled',
  'endpoint',
  'floating',
  'model',
  'placeholder',
  'provider'
]

export function defineWebMCPCommandInput(
  tagName = webMCPCommandInputTagName
): CommandInputConstructor {
  assertCustomElementsAvailable()

  const existingConstructor = customElements.get(tagName)
  if (existingConstructor) return existingConstructor as CommandInputConstructor

  class WebMCPCommandInput extends HTMLElement implements WebMCPCommandInputElement {
    static observedAttributes = observedAttributes

    apiKey?: string
    accountId?: string
    authMode?: 'none' | 'server' | 'user-key'
    baseUrl?: string
    context?: PlannerContext | (() => PlannerContext)
    endpoint?: string
    endpointOptions?: WebMCPCommandInputEndpointOption[]
    showChromeAI = true
    private chromeAIAvailable = false
    private chromeAILoadId = 0
    private floatingDragState?: FloatingDragState
    private floatingPanelBottom = 'auto'
    private floatingPanelLeft = '8px'
    private floatingPanelMaxHeight = 'calc(100vh - 16px)'
    private floatingPanelTop = '8px'
    private floatingPinnedBottom = true
    private floatingPinnedRight = true
    private floatingPlacement: FloatingPlacement = {
      horizontal: 'right',
      vertical: 'down'
    }
    private floatingPosition = {
      x: 24,
      y: 96
    }
    private floatingViewport = {
      height: 0,
      width: 0
    }
    private floatingWasPositioned = false
    private currentPlanner?: ToolPlanner
    private currentPlannerSignature = ''
    private currentPlannerWasCreated = false
    private isConnectedToDom = false
    private providerWasChosen = false
    private lightDomObserver?: MutationObserver
    private plannerLoadId = 0
    private plannerRevision = 0
    private providedPlanner?: ToolPlanner
    private providedPlannerConfig?: PlannerProviderConfig
    private running = false
    private readonly state: CommandInputRuntimeState = {
      buttonLabel: defaultButtonLabel,
      disabled: false,
      diagnosticsOpen: false,
      floating: false,
      floatingExpanded: false,
      hasDiagnostics: false,
      model: defaultModel,
      phase: 'idle',
      placeholder: defaultPlaceholder,
      prompt: '',
      plannerDetail: 'Planner is waiting for a command.',
      plannerName: 'Planner',
      provider: 'auto',
      settingsOpen: false
    }

    constructor() {
      super()
      this.attachShadow({ mode: 'open' })
    }

    connectedCallback() {
      this.isConnectedToDom = true
      this.syncAttributes()
      this.syncDiagnosticsContent()
      this.observeLightDom()
      this.floatingViewport = this.getViewportSize()
      this.render()
      window.addEventListener('resize', this.handleViewportChanged)
      void this.refreshChromeAIAvailability()
      void this.refreshPlannerStatus()
    }

    disconnectedCallback() {
      this.isConnectedToDom = false
      this.lightDomObserver?.disconnect()
      this.lightDomObserver = undefined
      window.removeEventListener('resize', this.handleViewportChanged)
      window.removeEventListener('pointermove', this.handleFloatingDragged)
      window.removeEventListener('pointerup', this.handleFloatingDragEnded)
      window.removeEventListener('pointercancel', this.handleFloatingDragEnded)
      this.invalidatePlanner()
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
      if (oldValue === newValue) return
      this.applyAttribute(name, newValue)
      if (!this.isConnectedToDom) return
      this.render()
      if (isPlannerAttribute(name)) {
        this.invalidatePlanner()
        void this.refreshPlannerStatus()
      }
    }

    get buttonLabel(): string {
      return this.state.buttonLabel
    }

    set buttonLabel(value: string | undefined) {
      this.state.buttonLabel = value || defaultButtonLabel
      this.renderIfConnected()
    }

    get disabled(): boolean {
      return this.state.disabled
    }

    set disabled(value: boolean) {
      this.state.disabled = value
      this.renderIfConnected()
    }

    get floating(): boolean {
      return this.state.floating
    }

    set floating(value: boolean) {
      this.state.floating = value
      if (!value) this.state.floatingExpanded = false
      this.renderIfConnected()
    }

    get model(): string | undefined {
      return this.state.fixedModel
    }

    set model(value: string | undefined) {
      this.state.fixedModel = value || undefined
      this.state.model = value || defaultModel
      this.invalidatePlanner()
      this.renderIfConnected()
      void this.refreshPlannerStatus()
    }

    get placeholder(): string {
      return this.state.placeholder
    }

    set placeholder(value: string | undefined) {
      this.state.placeholder = value || defaultPlaceholder
      this.renderIfConnected()
    }

    get planner(): ToolPlanner | undefined {
      return this.providedPlanner
    }

    set planner(value: ToolPlanner | undefined) {
      this.providedPlanner = value
      this.invalidatePlanner()
      this.renderIfConnected()
      void this.refreshPlannerStatus()
    }

    get plannerConfig(): PlannerProviderConfig | undefined {
      return this.providedPlannerConfig
    }

    set plannerConfig(value: PlannerProviderConfig | undefined) {
      this.providedPlannerConfig = value
      this.invalidatePlanner()
      this.renderIfConnected()
      void this.refreshPlannerStatus()
    }

    get provider(): PlannerProviderKind | undefined {
      return this.state.fixedProvider
    }

    set provider(value: PlannerProviderKind | undefined) {
      this.state.fixedProvider = isPlannerProviderKind(value) ? value : undefined
      this.providerWasChosen = Boolean(this.state.fixedProvider)
      this.state.provider = this.state.fixedProvider ?? 'auto'
      this.invalidatePlanner()
      this.renderIfConnected()
      void this.refreshPlannerStatus()
    }

    configure(options: WebMCPCommandInputConfigureOptions) {
      this.apiKey = options.apiKey ?? this.apiKey
      this.accountId = options.accountId ?? this.accountId
      this.authMode = options.authMode ?? this.authMode
      this.baseUrl = options.baseUrl ?? this.baseUrl
      this.context = options.context ?? this.context
      this.endpoint = options.endpoint ?? this.endpoint
      this.endpointOptions = options.endpointOptions ?? this.endpointOptions
      if (options.showChromeAI !== undefined) {
        this.showChromeAI = options.showChromeAI
        if (!this.showChromeAI) {
          this.chromeAIAvailable = false
          if (!this.state.fixedProvider && this.state.provider === 'chrome-built-in') {
            this.state.provider = getDefaultProvider(this.endpointOptions, false)
            this.state.model = getDefaultModelForProvider(this.state.provider, this.endpointOptions)
          }
        }
      }
      if (options.floating !== undefined) this.floating = options.floating
      if (options.initialProvider !== undefined && !this.state.fixedProvider) {
        this.providerWasChosen = true
        this.state.provider = options.initialProvider
      } else if (
        options.endpointOptions !== undefined &&
        !this.state.fixedProvider &&
        this.state.provider === 'auto'
      ) {
        this.state.provider = getDefaultProvider(
          options.endpointOptions,
          this.shouldShowChromeAIOption()
        )
      }
      if (options.initialModel !== undefined && !this.state.fixedModel) {
        this.state.model = options.initialModel
      } else if (options.endpointOptions !== undefined && !this.state.fixedModel) {
        this.state.model = getDefaultModelForProvider(this.state.provider, options.endpointOptions)
      }
      this.planner = options.planner ?? this.planner
      this.plannerConfig = options.plannerConfig ?? this.plannerConfig

      if (options.buttonLabel !== undefined) this.buttonLabel = options.buttonLabel
      if (options.disabled !== undefined) this.disabled = options.disabled
      if (options.placeholder !== undefined) this.placeholder = options.placeholder
      if (options.model !== undefined) this.model = options.model
      if (options.provider !== undefined) {
        this.providerWasChosen = true
        this.provider = options.provider
      }

      this.invalidatePlanner()
      this.renderIfConnected()
      void this.refreshChromeAIAvailability()
      void this.refreshPlannerStatus()
    }

    async run(message?: string): Promise<ToolInvocationResult | undefined> {
      if (this.state.floating) {
        this.state.floatingExpanded = true
        this.renderIfConnected()
        this.updateFloatingPlacement()
      }

      const input = this.getPromptInput()
      const command = (message ?? input?.value ?? this.state.prompt).trim()
      if (this.running || this.disabled || !command) return undefined

      this.state.prompt = command
      this.running = true
      this.setPhase('preparing')

      try {
        this.invalidateAutoPlannerBeforeRun()
        const planner = await this.getCurrentPlanner()
        const tools = listTools().map(function mapRegistration(registration) {
          return registration.tool
        })

        this.setPhase('planning')
        const plan = await planner.plan(command, tools, this.getPlannerContext())
        this.dispatchPlanEvent(command, plan, planner)
        this.setPhase('executing')

        const result = await invokePlannedSteps(plan, this.setActiveToolName.bind(this))
        this.setPhase(result.status === 'success' ? 'completed' : 'failed')
        this.dispatchResultEvent(command, plan, result)
        return result
      } catch (error) {
        const errorMessage = getErrorMessage(error)
        this.state.plannerDetail = errorMessage
        this.setPhase('failed')
        this.dispatchErrorEvent(command, errorMessage)
        return {
          toolName: this.state.plannerName,
          status: 'error',
          error: errorMessage,
          durationMs: 0
        }
      } finally {
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
      if (name === 'account-id') this.accountId = value ?? undefined
      if (name === 'api-key') this.apiKey = value ?? undefined
      if (name === 'auth-mode') this.authMode = isAuthMode(value) ? value : undefined
      if (name === 'base-url') this.baseUrl = value ?? undefined
      if (name === 'button-label') this.state.buttonLabel = value || defaultButtonLabel
      if (name === 'disabled') this.state.disabled = value !== null
      if (name === 'endpoint') this.endpoint = value ?? undefined
      if (name === 'floating') {
        this.state.floating = value !== null
        if (!this.state.floating) this.state.floatingExpanded = false
      }
      if (name === 'model') {
        this.state.fixedModel = value ?? undefined
        this.state.model = value || defaultModel
      }
      if (name === 'placeholder') this.state.placeholder = value || defaultPlaceholder
      if (name === 'provider') {
        this.state.fixedProvider = isPlannerProviderKind(value) ? value : undefined
        this.providerWasChosen = Boolean(this.state.fixedProvider)
        this.state.provider = this.state.fixedProvider ?? 'auto'
      }
    }

    private async getCurrentPlanner(): Promise<ToolPlanner> {
      if (this.planner) {
        this.state.plannerName = `${this.planner.name} (${this.planner.status})`
        this.state.plannerDetail = this.planner.detail
        this.dispatchPlannerEvent(this.planner)
        return this.planner
      }

      const plannerConfig = this.getPlannerConfig()
      const plannerSignature = JSON.stringify(plannerConfig ?? { provider: 'auto' })
      if (this.currentPlanner && this.currentPlannerSignature === plannerSignature)
        return this.currentPlanner

      this.disposeCreatedPlanner()
      const loadId = this.plannerLoadId + 1
      this.plannerLoadId = loadId
      const revision = this.plannerRevision
      const planner = await createCommandInputPlanner(plannerConfig)
      if (revision !== this.plannerRevision || loadId !== this.plannerLoadId) {
        planner.dispose?.()
        throw new Error(supersededPlannerRefreshMessage)
      }

      this.currentPlanner = planner
      this.currentPlannerWasCreated = true
      this.currentPlannerSignature = plannerSignature
      this.state.plannerName = `${this.currentPlanner.name} (${this.currentPlanner.status})`
      this.state.plannerDetail = this.currentPlanner.detail
      this.dispatchPlannerEvent(this.currentPlanner)
      return this.currentPlanner
    }

    private getPlannerConfig(): PlannerProviderConfig | undefined {
      if (this.plannerConfig) return this.plannerConfig

      const provider = this.state.fixedProvider ?? this.state.provider
      if (provider === 'auto') return undefined
      if (provider === 'chrome-built-in' || provider === 'local') {
        return {
          provider,
          auth: { mode: 'none' }
        }
      }

      const model = this.state.fixedModel ?? this.state.model
      const authMode = this.getAuthMode(provider)
      return {
        provider,
        model: model || undefined,
        baseUrl: this.baseUrl || undefined,
        accountId: this.accountId || undefined,
        auth:
          authMode === 'server'
            ? {
                mode: 'server',
                endpoint: this.endpoint || defaultEndpoint
              }
            : {
                mode: authMode,
                apiKey: this.apiKey || undefined
              }
      }
    }

    private getAuthMode(provider: PlannerProviderKind): 'none' | 'server' | 'user-key' {
      if (this.authMode) return this.authMode
      if (provider === 'cloudflare-binding') return 'server'
      if (this.endpoint && provider !== 'openai-compatible') return 'server'
      return 'user-key'
    }

    private getPlannerContext(): PlannerContext {
      const context = this.context
      if (typeof context === 'function') return context()
      return context ?? {}
    }

    private async refreshPlannerStatus() {
      if (!this.isConnectedToDom) return

      try {
        await this.getCurrentPlanner()
      } catch (error) {
        if (getErrorMessage(error) === supersededPlannerRefreshMessage) return
        this.state.plannerName = 'Planner'
        this.state.plannerDetail = getErrorMessage(error)
      }

      this.renderIfConnected()
    }

    private async refreshChromeAIAvailability() {
      const loadId = this.chromeAILoadId + 1
      this.chromeAILoadId = loadId
      if (!this.showChromeAI) {
        this.chromeAIAvailable = false
        this.renderIfConnected()
        return
      }

      const planner = await createChromeAIPlanner()
      planner.dispose?.()
      if (!this.isConnectedToDom || loadId !== this.chromeAILoadId) return
      if (this.chromeAIAvailable === planner.available) return
      const wasAvailable = this.chromeAIAvailable
      this.chromeAIAvailable = planner.available
      if (
        !wasAvailable &&
        this.chromeAIAvailable &&
        !this.providerWasChosen &&
        !this.state.fixedProvider
      ) {
        this.state.provider = 'chrome-built-in'
        this.state.model = ''
        this.invalidatePlanner()
        void this.refreshPlannerStatus()
      }
      this.renderIfConnected()
    }

    private disposeCreatedPlanner() {
      if (this.currentPlannerWasCreated) this.currentPlanner?.dispose?.()
      this.currentPlanner = undefined
      this.currentPlannerSignature = ''
      this.currentPlannerWasCreated = false
    }

    private invalidatePlanner() {
      this.plannerRevision += 1
      this.plannerLoadId += 1
      this.disposeCreatedPlanner()
    }

    private invalidateAutoPlannerBeforeRun() {
      if (this.planner || this.plannerConfig) return
      const provider = this.state.fixedProvider ?? this.state.provider
      if (provider === 'auto') this.invalidatePlanner()
    }

    private shouldShowChromeAIOption(): boolean {
      return this.showChromeAI && this.chromeAIAvailable
    }

    private setPhase(phase: WebMCPCommandInputPhase) {
      this.state.phase = phase
      this.renderIfConnected()
    }

    private setActiveToolName(toolName: string) {
      this.state.plannerDetail = `Running ${toolName}.`
      this.renderIfConnected()
    }

    private dispatchPlanEvent(message: string, plan: ToolPlan, planner: ToolPlanner) {
      this.dispatchEvent(
        new CustomEvent<WebMCPCommandPlanEventDetail>('webmcp-command-plan', {
          bubbles: true,
          composed: true,
          detail: {
            message,
            plan,
            planner
          }
        })
      )
    }

    private dispatchPlannerEvent(planner: ToolPlanner) {
      this.dispatchEvent(
        new CustomEvent<WebMCPCommandPlannerEventDetail>('webmcp-command-planner', {
          bubbles: true,
          composed: true,
          detail: {
            planner
          }
        })
      )
    }

    private dispatchResultEvent(message: string, plan: ToolPlan, result: ToolInvocationResult) {
      this.dispatchEvent(
        new CustomEvent<WebMCPCommandResultEventDetail>('webmcp-command-result', {
          bubbles: true,
          composed: true,
          detail: {
            message,
            plan,
            result
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

    private getPromptInput(): HTMLInputElement | null {
      return this.shadowRoot?.querySelector<HTMLInputElement>('[data-command-input]') ?? null
    }

    private handleSubmit(event: SubmitEvent) {
      event.preventDefault()
      void this.run()
    }

    private handleProviderChanged(event: Event) {
      const target = event.target
      if (!(target instanceof HTMLSelectElement)) return
      const provider = isPlannerProviderKind(target.value) ? target.value : 'auto'
      this.providerWasChosen = true
      this.state.provider = provider
      this.state.model = getDefaultModelForProvider(provider, this.endpointOptions)
      this.state.settingsOpen = true
      this.invalidatePlanner()
      this.render()
      void this.refreshPlannerStatus()
    }

    private handleModelChanged(event: Event) {
      const target = event.target
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return
      this.state.model = target.value
      this.invalidatePlanner()
      void this.refreshPlannerStatus()
    }

    private handleSettingsToggled(event: Event) {
      const target = event.target
      if (!(target instanceof HTMLDetailsElement)) return
      this.state.settingsOpen = target.open
      this.updateFloatingPlacement()
    }

    private handleDiagnosticsToggled(event: Event) {
      const target = event.target
      if (!(target instanceof HTMLDetailsElement)) return
      this.state.diagnosticsOpen = target.open
      this.updateFloatingPlacement()
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
      if (!this.shadowRoot) return

      const provider =
        this.plannerConfig?.provider ?? this.state.fixedProvider ?? this.state.provider
      const model = this.plannerConfig?.model ?? this.state.fixedModel ?? this.state.model
      const showChromeAIOption = this.shouldShowChromeAIOption()
      const showProviderControl =
        !this.planner &&
        !this.plannerConfig &&
        !this.state.fixedProvider &&
        getProviderOptionCount(this.endpointOptions, showChromeAIOption) > 1
      const showModelControl =
        !this.planner &&
        !this.plannerConfig &&
        !this.state.fixedModel &&
        getModelOptionCount(provider, this.endpointOptions) > 1
      const showDiagnostics = this.state.hasDiagnostics
      const optionsStatus = this.planner
        ? this.state.plannerName
        : getOptionsStatusText(provider, model, this.endpointOptions)
      const statusLabel = getStatusLabel(this.state.phase)
      const buttonLabel = this.running ? statusLabel : this.state.buttonLabel
      const commandMarkup = `
        <form class="webmcp-command" aria-label="WebMCP command input">
          <label class="webmcp-input-shell">
            <span>WebMCP</span>
            <input
              data-command-input
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="${escapeAttribute(this.state.placeholder)}"
              value="${escapeAttribute(this.state.prompt)}"
              ${this.state.disabled ? 'disabled' : ''}
            />
          </label>
          <button
            class="webmcp-run-button"
            type="submit"
            data-phase="${escapeAttribute(this.state.phase)}"
            ${this.running || this.state.disabled ? 'disabled' : ''}
            aria-busy="${String(this.running)}"
          >
            ${escapeHtml(buttonLabel)}
          </button>
        </form>
        ${
          showProviderControl || showModelControl
            ? `
          <details class="webmcp-settings" ${this.state.settingsOpen ? 'open' : ''}>
            <summary class="webmcp-settings-summary">
              <span>Options</span>
              <span class="webmcp-status" aria-live="polite" aria-atomic="true">
              ${escapeHtml(optionsStatus)}
              </span>
            </summary>
            <div class="webmcp-settings-grid">
              ${showProviderControl ? getProviderControlMarkup(provider, this.endpointOptions, showChromeAIOption) : ''}
              ${showModelControl ? getModelControlMarkup(provider, model, this.endpointOptions) : ''}
            </div>
          </details>
        `
            : ''
        }
        ${
          showDiagnostics
            ? `
          <details class="webmcp-diagnostics" ${this.state.diagnosticsOpen ? 'open' : ''}>
            <summary class="webmcp-disclosure-summary">
              <span>Developer diagnostics</span>
            </summary>
            <div class="webmcp-diagnostics-content">
              <slot name="diagnostics"></slot>
            </div>
          </details>
        `
            : ''
        }
      `

      this.shadowRoot.innerHTML = this.state.floating
        ? `
        <style>${getStyles()}</style>
        <button
          class="webmcp-floating-trigger"
          type="button"
          aria-label="Open WebMCP command input"
          aria-expanded="${String(this.state.floatingExpanded)}"
        >
          <span>WEB</span>
          <span>MCP</span>
        </button>
        <section
          class="webmcp-floating-panel webmcp-floating-panel--${this.floatingPlacement.vertical} webmcp-floating-panel--${this.floatingPlacement.horizontal}"
          style="left: ${escapeAttribute(this.floatingPanelLeft)}; top: ${escapeAttribute(this.floatingPanelTop)}; bottom: ${escapeAttribute(this.floatingPanelBottom)}; --webmcp-floating-panel-max-height: ${escapeAttribute(this.floatingPanelMaxHeight)}"
          ${this.state.floatingExpanded ? '' : 'hidden'}
        >
          ${commandMarkup}
        </section>
      `
        : `
        <style>${getStyles()}</style>
        ${commandMarkup}
      `

      const form = this.shadowRoot.querySelector<HTMLFormElement>('form')
      const input = this.shadowRoot.querySelector<HTMLInputElement>('[data-command-input]')
      const floatingTrigger = this.shadowRoot.querySelector<HTMLButtonElement>(
        '.webmcp-floating-trigger'
      )
      const settingsControl = this.shadowRoot.querySelector<HTMLDetailsElement>('.webmcp-settings')
      const diagnosticsControl =
        this.shadowRoot.querySelector<HTMLDetailsElement>('.webmcp-diagnostics')
      const providerControl = this.shadowRoot.querySelector<HTMLSelectElement>('[data-provider]')
      const modelControl = this.shadowRoot.querySelector<HTMLInputElement | HTMLSelectElement>(
        '[data-model]'
      )

      this.syncFloatingHost()

      form?.addEventListener('submit', this.handleSubmit.bind(this))
      input?.addEventListener('input', this.handlePromptChanged.bind(this))
      floatingTrigger?.addEventListener('click', this.handleFloatingTriggerClicked)
      floatingTrigger?.addEventListener('pointerdown', this.handleFloatingDragStarted)
      settingsControl?.addEventListener('toggle', this.handleSettingsToggled.bind(this))
      diagnosticsControl?.addEventListener('toggle', this.handleDiagnosticsToggled.bind(this))
      providerControl?.addEventListener('change', this.handleProviderChanged.bind(this))
      modelControl?.addEventListener('input', this.handleModelChanged.bind(this))
      modelControl?.addEventListener('change', this.handleModelChanged.bind(this))
      this.updateFloatingPlacement()
    }

    private readonly handleFloatingTriggerClicked = () => {
      if (this.floatingDragState?.hasMoved) return
      this.state.floatingExpanded = !this.state.floatingExpanded
      this.renderIfConnected()
      this.updateFloatingPlacement()
    }

    private readonly handleFloatingDragStarted = (event: PointerEvent) => {
      if (!(event.currentTarget instanceof HTMLElement)) return
      const rect = event.currentTarget.getBoundingClientRect()
      this.floatingDragState = {
        hasMoved: false,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        pointerId: event.pointerId
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      window.addEventListener('pointermove', this.handleFloatingDragged)
      window.addEventListener('pointerup', this.handleFloatingDragEnded)
      window.addEventListener('pointercancel', this.handleFloatingDragEnded)
    }

    private readonly handleFloatingDragged = (event: PointerEvent) => {
      if (!this.floatingDragState || event.pointerId !== this.floatingDragState.pointerId) return
      const nextX = event.clientX - this.floatingDragState.offsetX
      const nextY = event.clientY - this.floatingDragState.offsetY
      const deltaX = Math.abs(nextX - this.floatingPosition.x)
      const deltaY = Math.abs(nextY - this.floatingPosition.y)
      const nextPosition = this.clampFloatingPosition(nextX, nextY)
      const bounds = this.getFloatingBounds()

      if (deltaX > 3 || deltaY > 3) this.floatingDragState.hasMoved = true
      this.floatingPosition = nextPosition
      this.floatingPinnedRight = Math.abs(nextPosition.x - bounds.maxX) <= 2
      this.floatingPinnedBottom = Math.abs(nextPosition.y - bounds.maxY) <= 2
      this.syncFloatingHost()
      this.updateFloatingPlacement()
    }

    private readonly handleFloatingDragEnded = (event: PointerEvent) => {
      if (!this.floatingDragState || event.pointerId !== this.floatingDragState.pointerId) return
      window.removeEventListener('pointermove', this.handleFloatingDragged)
      window.removeEventListener('pointerup', this.handleFloatingDragEnded)
      window.removeEventListener('pointercancel', this.handleFloatingDragEnded)
      window.setTimeout(() => {
        this.floatingDragState = undefined
      }, 0)
    }

    private readonly handleViewportChanged = () => {
      if (!this.state.floating) return
      const triggerWidth = this.getFloatingTriggerWidth()
      const triggerHeight = this.getFloatingTriggerHeight()
      const previousMaxX = Math.max(8, this.floatingViewport.width - triggerWidth - 8)
      const previousMaxY = Math.max(8, this.floatingViewport.height - triggerHeight - 8)
      const wasPinnedRight =
        this.floatingPinnedRight || Math.abs(this.floatingPosition.x - previousMaxX) <= 2
      const wasPinnedBottom =
        this.floatingPinnedBottom || Math.abs(this.floatingPosition.y - previousMaxY) <= 2
      this.floatingViewport = this.getViewportSize()
      const nextMaxX = Math.max(8, this.floatingViewport.width - triggerWidth - 8)
      const nextMaxY = Math.max(8, this.floatingViewport.height - triggerHeight - 8)
      const nextX = wasPinnedRight ? nextMaxX : this.floatingPosition.x
      const nextY = wasPinnedBottom ? nextMaxY : this.floatingPosition.y

      this.floatingPinnedRight = wasPinnedRight
      this.floatingPinnedBottom = wasPinnedBottom
      this.floatingPosition = this.clampFloatingPosition(nextX, nextY)
      this.syncFloatingHost()
      this.updateFloatingPlacement()
    }

    private syncFloatingHost() {
      this.toggleAttribute('data-floating', this.state.floating)
      this.toggleAttribute(
        'data-floating-expanded',
        this.state.floating && this.state.floatingExpanded
      )
      if (!this.state.floating) {
        this.style.removeProperty('left')
        this.style.removeProperty('top')
        this.style.removeProperty('right')
        this.style.removeProperty('bottom')
        return
      }

      if (!this.floatingWasPositioned) this.setInitialFloatingPosition()
      if (this.floatingPinnedRight) {
        this.style.removeProperty('left')
        this.style.right = '8px'
      } else {
        this.style.left = `${this.floatingPosition.x}px`
        this.style.removeProperty('right')
      }

      if (this.floatingPinnedBottom) {
        this.style.removeProperty('top')
        this.style.bottom = '8px'
      } else {
        this.style.top = `${this.floatingPosition.y}px`
        this.style.removeProperty('bottom')
      }
    }

    private setInitialFloatingPosition() {
      const bounds = this.getFloatingBounds()
      this.floatingPosition = {
        x: bounds.maxX,
        y: bounds.maxY
      }
      this.floatingPinnedRight = true
      this.floatingPinnedBottom = true
      this.floatingViewport = this.getViewportSize()
      this.floatingWasPositioned = true
    }

    private clampFloatingPosition(x: number, y: number): { x: number; y: number } {
      const { maxX, maxY } = this.getFloatingBounds()

      return {
        x: Math.min(Math.max(8, x), maxX),
        y: Math.min(Math.max(8, y), maxY)
      }
    }

    private getFloatingTriggerWidth(): number {
      return (
        this.shadowRoot?.querySelector<HTMLElement>('.webmcp-floating-trigger')?.offsetWidth || 0
      )
    }

    private getFloatingTriggerHeight(): number {
      return (
        this.shadowRoot?.querySelector<HTMLElement>('.webmcp-floating-trigger')?.offsetHeight || 0
      )
    }

    private getFloatingBounds(): { maxX: number; maxY: number } {
      const viewport = this.getViewportSize()
      const width = this.getFloatingTriggerWidth()
      const height = this.getFloatingTriggerHeight()

      return {
        maxX: Math.max(8, viewport.width - width - 8),
        maxY: Math.max(8, viewport.height - height - 8)
      }
    }

    private getViewportSize(): { height: number; width: number } {
      return {
        height: window.innerHeight,
        width: window.innerWidth
      }
    }

    private updateFloatingPlacement() {
      if (!this.state.floating || !this.state.floatingExpanded) return
      const trigger = this.shadowRoot?.querySelector<HTMLElement>('.webmcp-floating-trigger')
      const panel = this.shadowRoot?.querySelector<HTMLElement>('.webmcp-floating-panel')
      if (!trigger || !panel) return

      const triggerRect = trigger.getBoundingClientRect()
      const panelWidth = Math.min(panel.scrollWidth || 920, window.innerWidth - 16)
      const panelHeight = Math.min(panel.scrollHeight || 320, window.innerHeight - 16)
      const spaceAbove = triggerRect.top - 8
      const spaceBelow = window.innerHeight - triggerRect.bottom - 8
      const spaceLeft = triggerRect.right - 8
      const spaceRight = window.innerWidth - triggerRect.left - 8
      const vertical = spaceBelow >= panelHeight || spaceBelow >= spaceAbove ? 'down' : 'up'
      const horizontal = spaceRight >= panelWidth || spaceRight >= spaceLeft ? 'right' : 'left'
      const maxHeight = Math.max(0, vertical === 'down' ? spaceBelow - 8 : spaceAbove - 8)
      const panelLeft =
        horizontal === 'right'
          ? Math.min(triggerRect.left, window.innerWidth - panelWidth - 8)
          : Math.max(8, triggerRect.right - panelWidth)
      const panelTop =
        vertical === 'down'
          ? `${Math.min(triggerRect.bottom + 8, window.innerHeight - panelHeight - 8)}px`
          : 'auto'
      const panelBottom =
        vertical === 'up' ? `${Math.max(8, window.innerHeight - triggerRect.top + 8)}px` : 'auto'

      if (
        this.floatingPlacement.vertical === vertical &&
        this.floatingPlacement.horizontal === horizontal &&
        this.floatingPanelMaxHeight === `${maxHeight}px` &&
        this.floatingPanelLeft === `${panelLeft}px` &&
        this.floatingPanelTop === panelTop &&
        this.floatingPanelBottom === panelBottom
      ) {
        return
      }

      this.floatingPlacement = { horizontal, vertical }
      this.floatingPanelLeft = `${panelLeft}px`
      this.floatingPanelMaxHeight = `${maxHeight}px`
      this.floatingPanelTop = panelTop
      this.floatingPanelBottom = panelBottom
      this.renderIfConnected()
    }
  }

  customElements.define(tagName, WebMCPCommandInput)
  return WebMCPCommandInput
}

async function invokePlannedSteps(
  plan: ToolPlan,
  setActiveToolName: (toolName: string) => void
): Promise<ToolInvocationResult> {
  const steps = getPlanSteps(plan)
  let result: ToolInvocationResult | undefined

  for (const [index, step] of steps.entries()) {
    const toolName =
      steps.length > 1 ? `${step.toolName} (${index + 1}/${steps.length})` : step.toolName
    setActiveToolName(toolName)
    result = await invokeTool({
      toolName: step.toolName,
      input: step.input,
      source: 'planner'
    })
    if (result.status !== 'success') return result
  }

  return (
    result ?? {
      toolName: plan.toolName,
      status: 'error',
      error: 'Planner returned no executable steps.',
      durationMs: 0
    }
  )
}

function getPlanSteps(plan: ToolPlan): ToolPlanStep[] {
  if (Array.isArray(plan.steps)) return plan.steps

  return [
    {
      toolName: plan.toolName,
      input: plan.input,
      confidence: plan.confidence,
      reason: plan.reason
    }
  ]
}

function getStatusLabel(phase: WebMCPCommandInputPhase): string {
  if (phase === 'preparing') return 'Preparing...'
  if (phase === 'planning') return 'Planning...'
  if (phase === 'executing') return 'Running...'
  return defaultButtonLabel
}

function assertCustomElementsAvailable() {
  if (typeof customElements === 'undefined' || typeof HTMLElement === 'undefined') {
    throw new Error(
      'WebMCP command input can only be defined in a browser custom elements environment.'
    )
  }
}
