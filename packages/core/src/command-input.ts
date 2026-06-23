import type {
  PlannerContext,
  PlannerProviderConfig,
  PlannerProviderKind,
  ToolInvocationResult,
  ToolPlan,
  ToolPlanner
} from './interfaces/tool'
import type {
  WebMCPCommandErrorEventDetail,
  WebMCPCommandInputConfigureOptions,
  WebMCPCommandInputElement,
  WebMCPCommandInputEndpointOption,
  WebMCPCommandInputPlannerOption,
  WebMCPCommandInputPhase,
  WebMCPCommandPanelToggleEventDetail,
  WebMCPCommandPlanEventDetail,
  WebMCPCommandPlannerEventDetail,
  WebMCPCommandResultEventDetail,
  WebMCPCommandStepEventDetail,
  WebMCPCommandInputRunOptions
} from './interfaces/command-input'
import {
  getShadowMarkup,
  getStructureSignature,
  type CommandInputViewState
} from './command-input-render'
import { invokePlannedSteps, throwIfAborted } from './command-input-runner'
import { getErrorMessage } from './confirmation'
import {
  createCommandInputPlanner,
  defaultEndpoint,
  defaultModel,
  getDefaultModelForProvider,
  getDefaultModelForPlannerOption,
  getDefaultProvider,
  getModelControlMarkup,
  getModelOptionCount,
  getOptionsStatusText,
  getPlannerOptionModelControlMarkup,
  getPlannerOptionModelOptionCount,
  getPlannerOptionId,
  getPlannerOptionStatusText,
  getPlannerOptionValue,
  getProviderControlMarkup,
  getProviderOptionCount,
  isAuthMode,
  isPlannerAttribute,
  isPlannerProviderKind
} from './command-input-options'
import { createChromeAIPlanner } from './planner'
import { listTools } from './registry'

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
  plannerOptionId?: string
  placeholder: string
  prompt: string
  plannerDetail: string
  plannerName: string
  provider: PlannerProviderKind
  settingsOpen: boolean
}

const defaultPlaceholder = 'Tell this app what to do'
const defaultButtonLabel = 'Run'
const supersededPlannerRefreshMessage = 'Planner refresh was superseded.'
const webMCPCommandInputTagName = 'webmcp-command-input'
const observedAttributes = [
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
    authMode?: 'none' | 'server' | 'user-key'
    baseUrl?: string
    context?: PlannerContext | (() => PlannerContext)
    endpoint?: string
    endpointOptions?: WebMCPCommandInputEndpointOption[]
    paidServices?: WebMCPCommandInputConfigureOptions['paidServices']
    plannerOptions?: WebMCPCommandInputPlannerOption[]
    showChromeAI = true
    private chromeAIAvailable = false
    private chromeAILoadId = 0
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
    private renderedStructureSignature = ''
    private running = false
    private userSelectedModel = false
    private userSelectedPlanner = false
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
      this.render()
      if (this.state.floatingExpanded) this.focusPromptInput()
      void this.refreshChromeAIAvailability()
      void this.refreshPlannerStatus()
    }

    disconnectedCallback() {
      this.isConnectedToDom = false
      this.lightDomObserver?.disconnect()
      this.lightDomObserver = undefined
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
      this.applyButtonLabelState(value)
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
      this.applyFloatingState(value)
      this.renderIfConnected()
    }

    get panelOpen(): boolean {
      return this.state.floatingExpanded
    }

    set panelOpen(value: boolean) {
      this.setPanelOpen(value)
    }

    get model(): string | undefined {
      return this.state.fixedModel
    }

    set model(value: string | undefined) {
      this.applyModelState(value)
      this.invalidatePlanner()
      this.renderIfConnected()
      void this.refreshPlannerStatus()
    }

    get placeholder(): string {
      return this.state.placeholder
    }

    set placeholder(value: string | undefined) {
      this.applyPlaceholderState(value)
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
      this.applyProviderState(value)
      this.invalidatePlanner()
      this.renderIfConnected()
      void this.refreshPlannerStatus()
    }

    configure(options: WebMCPCommandInputConfigureOptions) {
      this.apiKey = options.apiKey ?? this.apiKey
      this.authMode = options.authMode ?? this.authMode
      this.baseUrl = options.baseUrl ?? this.baseUrl
      this.context = options.context ?? this.context
      this.endpoint = options.endpoint ?? this.endpoint
      this.endpointOptions = options.endpointOptions ?? this.endpointOptions
      this.paidServices = options.paidServices ?? this.paidServices
      this.plannerOptions = options.plannerOptions ?? this.plannerOptions
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
      if (options.floating !== undefined) this.applyFloatingState(options.floating)
      if (
        options.initialProvider !== undefined &&
        !this.state.fixedProvider &&
        !this.userSelectedPlanner
      ) {
        this.providerWasChosen = true
        this.state.plannerOptionId = undefined
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
      if (
        options.initialModel !== undefined &&
        !this.state.fixedModel &&
        !this.userSelectedPlanner &&
        !this.userSelectedModel
      ) {
        this.state.model = options.initialModel
      } else if (
        options.endpointOptions !== undefined &&
        !this.state.fixedModel &&
        !this.userSelectedModel
      ) {
        this.state.model = getDefaultModelForProvider(this.state.provider, options.endpointOptions)
      }
      if (
        options.initialPlannerOptionId !== undefined &&
        !this.state.fixedProvider &&
        !this.userSelectedPlanner
      ) {
        const initialPlannerOption = this.getPlannerOptionById(options.initialPlannerOptionId)
        if (initialPlannerOption) {
          this.providerWasChosen = true
          this.state.plannerOptionId = initialPlannerOption.id
          this.state.provider = 'auto'
          if (!this.state.fixedModel) {
            this.state.model = getDefaultModelForPlannerOption(initialPlannerOption)
          }
        }
      }
      if (options.settingsOpen !== undefined) this.state.settingsOpen = options.settingsOpen
      if (options.planner !== undefined) this.providedPlanner = options.planner
      if (options.plannerConfig !== undefined) this.providedPlannerConfig = options.plannerConfig

      if (options.buttonLabel !== undefined) this.applyButtonLabelState(options.buttonLabel)
      if (options.disabled !== undefined) this.state.disabled = options.disabled
      if (options.placeholder !== undefined) this.applyPlaceholderState(options.placeholder)
      if (options.model !== undefined) this.applyModelState(options.model)
      if (options.provider !== undefined) this.applyProviderState(options.provider)

      this.invalidatePlanner()
      this.renderIfConnected()
      void this.refreshChromeAIAvailability()
      void this.refreshPlannerStatus()
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
        throwIfAborted(options.signal)
        const plan = await planner.plan(command, tools, this.getPlannerContext(), {
          signal: options.signal
        })
        this.dispatchPlanEvent(command, plan, planner)
        this.setPhase('executing')

        const result = await invokePlannedSteps(
          plan,
          this.setActiveToolName.bind(this),
          (detail) => this.dispatchStepEvent(command, detail),
          options.signal
        )
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
      if (name === 'api-key') this.apiKey = value ?? undefined
      if (name === 'auth-mode') this.authMode = isAuthMode(value) ? value : undefined
      if (name === 'base-url') this.baseUrl = value ?? undefined
      if (name === 'button-label') this.applyButtonLabelState(value ?? undefined)
      if (name === 'disabled') this.state.disabled = value !== null
      if (name === 'endpoint') this.endpoint = value ?? undefined
      if (name === 'floating') this.applyFloatingState(value !== null)
      if (name === 'model') this.applyModelState(value ?? undefined)
      if (name === 'placeholder') this.applyPlaceholderState(value ?? undefined)
      if (name === 'provider') this.applyProviderState(value)
    }

    private applyButtonLabelState(value: string | undefined) {
      this.state.buttonLabel = value || defaultButtonLabel
    }

    private applyPlaceholderState(value: string | undefined) {
      this.state.placeholder = value || defaultPlaceholder
    }

    private applyFloatingState(value: boolean) {
      this.state.floating = value
      if (!value) this.state.floatingExpanded = false
    }

    private applyModelState(value: string | undefined) {
      this.state.fixedModel = value || undefined
      this.state.model = value || defaultModel
    }

    private applyProviderState(value: string | null | undefined) {
      this.state.fixedProvider = isPlannerProviderKind(value) ? value : undefined
      this.providerWasChosen = Boolean(this.state.fixedProvider)
      this.state.plannerOptionId = undefined
      this.state.provider = this.state.fixedProvider ?? 'auto'
    }

    private async getCurrentPlanner(): Promise<ToolPlanner> {
      if (this.planner) {
        this.state.plannerName = `${this.planner.name} (${this.planner.status})`
        this.state.plannerDetail = this.planner.detail
        this.dispatchPlannerEvent(this.planner)
        return this.planner
      }

      const plannerOption = this.getSelectedPlannerOption()
      if (plannerOption) {
        const plannerModel = this.state.fixedModel ?? this.state.model
        const plannerSignature = JSON.stringify({
          plannerOption: plannerOption.id,
          model: plannerModel || undefined
        })
        if (this.currentPlanner && this.currentPlannerSignature === plannerSignature)
          return this.currentPlanner

        this.disposeCreatedPlanner()
        const loadId = this.plannerLoadId + 1
        this.plannerLoadId = loadId
        const revision = this.plannerRevision
        const planner = await plannerOption.createPlanner({
          model: plannerModel || undefined,
          modelOption: plannerOption.modelOptions?.find(function findModelOption(option) {
            return option.model === plannerModel
          })
        })
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

      const plannerConfig = this.getPlannerConfig()
      const plannerSignature = JSON.stringify(getPlannerConfigSignature(plannerConfig))
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
      const endpointOption = this.getEndpointOption(provider, model)
      return {
        provider,
        model: model || undefined,
        baseUrl: this.baseUrl || undefined,
        paidService: endpointOption?.paidService,
        paidServices: this.paidServices,
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

    private getEndpointOption(
      provider: PlannerProviderKind,
      model: string
    ): WebMCPCommandInputEndpointOption | undefined {
      return this.endpointOptions?.find(function findEndpointOption(option) {
        return option.provider === provider && (option.model ?? '') === (model || '')
      })
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
        !this.state.fixedProvider &&
        !this.state.plannerOptionId
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
      if (this.state.plannerOptionId) return
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
      const plannerOptionId = getPlannerOptionId(target.value)
      const provider = isPlannerProviderKind(target.value) ? target.value : 'auto'
      this.providerWasChosen = true
      this.userSelectedPlanner = true
      this.state.plannerOptionId = plannerOptionId
      this.state.provider = provider
      this.state.model = plannerOptionId
        ? getDefaultModelForPlannerOption(this.getPlannerOptionById(plannerOptionId))
        : getDefaultModelForProvider(provider, this.endpointOptions)
      this.state.settingsOpen = true
      this.invalidatePlanner()
      this.render()
      void this.refreshPlannerStatus()
    }

    private handleModelChanged(event: Event) {
      const target = event.target
      if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return
      this.userSelectedModel = true
      this.state.model = target.value
      this.invalidatePlanner()
      void this.refreshPlannerStatus()
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

    private handlePanelKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !this.state.floatingExpanded) return
      event.preventDefault()
      this.closePanel()
    }

    private setPanelOpen(value: boolean) {
      if (this.state.floatingExpanded === value) {
        if (value) this.focusPromptInput()
        return
      }
      this.state.floatingExpanded = value
      this.renderIfConnected()
      this.dispatchPanelToggleEvent(value)
      if (value) this.focusPromptInput()
    }

    private focusPromptInput() {
      this.getPromptInput()?.focus()
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
      if (!this.shadowRoot) return
      const view = this.getViewState()
      const structureSignature = getStructureSignature(view)
      if (this.renderedStructureSignature !== structureSignature) {
        this.renderStructure(view)
        this.renderedStructureSignature = structureSignature
      }
      this.applyViewState(view)
    }

    private getViewState(): CommandInputViewState {
      const plannerOption = this.getSelectedPlannerOption()
      const provider =
        this.plannerConfig?.provider ?? this.state.fixedProvider ?? this.state.provider
      const model = this.plannerConfig?.model ?? this.state.fixedModel ?? this.state.model
      const providerControlValue = plannerOption
        ? getPlannerOptionValue(plannerOption.id)
        : provider
      const showChromeAIOption = this.shouldShowChromeAIOption()
      const showProviderControl =
        !this.planner &&
        !this.plannerConfig &&
        !this.state.fixedProvider &&
        getProviderOptionCount(this.endpointOptions, showChromeAIOption, this.plannerOptions) > 1
      const showModelControl =
        !this.planner &&
        !this.plannerConfig &&
        !this.state.fixedModel &&
        (plannerOption
          ? getPlannerOptionModelOptionCount(plannerOption) > 1
          : getModelOptionCount(provider, this.endpointOptions) > 1)
      const optionsStatus = this.planner
        ? this.state.plannerName
        : plannerOption
          ? getPlannerOptionStatusText(plannerOption, model)
          : getOptionsStatusText(provider, model, this.endpointOptions)

      return {
        buttonLabel: this.running ? getStatusLabel(this.state.phase) : this.state.buttonLabel,
        diagnosticsOpen: this.state.diagnosticsOpen,
        disabled: this.state.disabled,
        floating: this.state.floating,
        floatingExpanded: this.state.floatingExpanded,
        modelControlMarkup: showModelControl
          ? plannerOption
            ? getPlannerOptionModelControlMarkup(plannerOption, model)
            : getModelControlMarkup(provider, model, this.endpointOptions)
          : '',
        optionsStatus,
        phase: this.state.phase,
        placeholder: this.state.placeholder,
        prompt: this.state.prompt,
        providerControlMarkup: showProviderControl
          ? getProviderControlMarkup(
              providerControlValue,
              this.endpointOptions,
              showChromeAIOption,
              this.plannerOptions
            )
          : '',
        running: this.running,
        settingsOpen: this.state.settingsOpen,
        showDiagnostics: this.state.hasDiagnostics,
        showSettings: showProviderControl || showModelControl
      }
    }

    private renderStructure(view: CommandInputViewState) {
      if (!this.shadowRoot) return
      const previousInput = this.getPromptInput()
      const shouldRestorePromptFocus = this.shadowRoot.activeElement === previousInput
      const selectionStart = previousInput?.selectionStart
      const selectionEnd = previousInput?.selectionEnd

      this.shadowRoot.innerHTML = getShadowMarkup(view)

      const form = this.shadowRoot.querySelector<HTMLFormElement>('form')
      const input = this.shadowRoot.querySelector<HTMLInputElement>('[data-command-input]')
      const floatingPanel = this.shadowRoot.querySelector<HTMLElement>('.webmcp-floating-panel')
      const settingsControl = this.shadowRoot.querySelector<HTMLDetailsElement>('.webmcp-settings')
      const diagnosticsControl =
        this.shadowRoot.querySelector<HTMLDetailsElement>('.webmcp-diagnostics')
      const providerControl = this.shadowRoot.querySelector<HTMLSelectElement>('[data-provider]')
      const modelControl = this.shadowRoot.querySelector<HTMLInputElement | HTMLSelectElement>(
        '[data-model]'
      )

      form?.addEventListener('submit', this.handleSubmit.bind(this))
      input?.addEventListener('input', this.handlePromptChanged.bind(this))
      floatingPanel?.addEventListener('keydown', this.handlePanelKeyDown.bind(this))
      settingsControl?.addEventListener('toggle', this.handleSettingsToggled.bind(this))
      diagnosticsControl?.addEventListener('toggle', this.handleDiagnosticsToggled.bind(this))
      providerControl?.addEventListener('change', this.handleProviderChanged.bind(this))
      modelControl?.addEventListener('input', this.handleModelChanged.bind(this))
      modelControl?.addEventListener('change', this.handleModelChanged.bind(this))
      if (shouldRestorePromptFocus) {
        input?.focus({ preventScroll: true })
        if (selectionStart !== null && selectionEnd !== null) {
          input?.setSelectionRange(selectionStart ?? 0, selectionEnd ?? selectionStart ?? 0)
        }
      }
    }

    private applyViewState(view: CommandInputViewState) {
      const root = this.shadowRoot
      if (!root) return

      const input = this.getPromptInput()
      if (input) {
        input.placeholder = view.placeholder
        if (input.value !== view.prompt) input.value = view.prompt
        if (input.getAttribute('value') !== view.prompt) input.setAttribute('value', view.prompt)
        input.toggleAttribute('disabled', view.disabled)
      }

      const button = root.querySelector<HTMLButtonElement>('.webmcp-run-button')
      if (button) {
        button.dataset.phase = view.phase
        button.toggleAttribute('disabled', view.running || view.disabled)
        button.setAttribute('aria-busy', String(view.running))
        if (button.textContent.trim() !== view.buttonLabel) button.textContent = view.buttonLabel
      }

      const settingsControl = root.querySelector<HTMLDetailsElement>('.webmcp-settings')
      if (settingsControl && settingsControl.open !== view.settingsOpen) {
        settingsControl.open = view.settingsOpen
      }
      const status = root.querySelector<HTMLElement>('.webmcp-settings-summary .webmcp-status')
      if (status && status.textContent.trim() !== view.optionsStatus) {
        status.textContent = view.optionsStatus
      }

      const diagnosticsControl = root.querySelector<HTMLDetailsElement>('.webmcp-diagnostics')
      if (diagnosticsControl && diagnosticsControl.open !== view.diagnosticsOpen) {
        diagnosticsControl.open = view.diagnosticsOpen
      }

      const floatingPanel = root.querySelector<HTMLElement>('.webmcp-floating-panel')
      if (floatingPanel) floatingPanel.hidden = !view.floatingExpanded

      this.syncFloatingHost()
    }

    private getSelectedPlannerOption(): WebMCPCommandInputPlannerOption | undefined {
      const plannerOptionId = this.state.plannerOptionId
      if (!plannerOptionId) return undefined

      return this.getPlannerOptionById(plannerOptionId)
    }

    private getPlannerOptionById(
      plannerOptionId: string
    ): WebMCPCommandInputPlannerOption | undefined {
      return this.plannerOptions?.find(function findPlannerOption(option) {
        return option.id === plannerOptionId
      })
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
      }
    }
  }

  customElements.define(tagName, WebMCPCommandInput)
  return WebMCPCommandInput
}

function getStatusLabel(phase: WebMCPCommandInputPhase): string {
  if (phase === 'preparing') return 'Preparing...'
  if (phase === 'planning') return 'Planning...'
  if (phase === 'executing') return 'Running...'
  return defaultButtonLabel
}

function getPlannerConfigSignature(config: PlannerProviderConfig | undefined) {
  if (!config) return { provider: 'auto' }

  return {
    auth: config.auth,
    baseUrl: config.baseUrl,
    model: config.model,
    paidService: config.paidService,
    paidServices: config.paidServices
      ? {
          accessKeyConfigured: Boolean(config.paidServices.accessKey),
          services: config.paidServices.services
        }
      : undefined,
    provider: config.provider
  }
}

function assertCustomElementsAvailable() {
  if (typeof customElements === 'undefined' || typeof HTMLElement === 'undefined') {
    throw new Error(
      'WebMCP command input can only be defined in a browser custom elements environment.'
    )
  }
}
