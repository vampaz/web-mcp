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
  WebMCPCommandInputPhase,
  WebMCPCommandPlanEventDetail,
  WebMCPCommandPlannerEventDetail,
  WebMCPCommandResultEventDetail
} from './interfaces/command-input'
import { createBestPlanner, createChromeAIPlanner, createConfiguredPlanner, createHeuristicPlanner } from './planner'
import { invokeTool, listTools } from './registry'

type CommandInputConstructor = CustomElementConstructor & {
  observedAttributes: string[]
}

type CommandInputRuntimeState = {
  buttonLabel: string
  disabled: boolean
  fixedModel?: string
  fixedProvider?: PlannerProviderKind
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

type ModelOption = {
  label: string
  value: string
}

const defaultPlaceholder = 'Tell this app what to do'
const defaultButtonLabel = 'Run'
const defaultModel = 'openrouter/auto'
const defaultEndpoint = '/api/webmcp/plan'
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
  'model',
  'placeholder',
  'provider'
]

export function defineWebMCPCommandInput(tagName = webMCPCommandInputTagName): CommandInputConstructor {
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
    private currentPlanner?: ToolPlanner
    private currentPlannerSignature = ''
    private currentPlannerWasCreated = false
    private isConnectedToDom = false
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
      this.planner = options.planner ?? this.planner
      this.plannerConfig = options.plannerConfig ?? this.plannerConfig

      if (options.buttonLabel !== undefined) this.buttonLabel = options.buttonLabel
      if (options.disabled !== undefined) this.disabled = options.disabled
      if (options.placeholder !== undefined) this.placeholder = options.placeholder
      if (options.model !== undefined) this.model = options.model
      if (options.provider !== undefined) this.provider = options.provider

      this.invalidatePlanner()
      this.renderIfConnected()
      void this.refreshPlannerStatus()
    }

    async run(message?: string): Promise<ToolInvocationResult | undefined> {
      const input = this.getPromptInput()
      const command = (message ?? input?.value ?? this.state.prompt).trim()
      if (this.running || this.disabled || !command) return undefined

      this.state.prompt = command
      this.running = true
      this.setPhase('preparing')

      try {
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
      if (name === 'model') {
        this.state.fixedModel = value ?? undefined
        this.state.model = value || defaultModel
      }
      if (name === 'placeholder') this.state.placeholder = value || defaultPlaceholder
      if (name === 'provider') {
        this.state.fixedProvider = isPlannerProviderKind(value) ? value : undefined
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
      if (this.currentPlanner && this.currentPlannerSignature === plannerSignature) return this.currentPlanner

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
        auth: authMode === 'server'
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
      if (this.endpoint || provider === 'cloudflare-binding') return 'server'
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

    private setPhase(phase: WebMCPCommandInputPhase) {
      this.state.phase = phase
      this.renderIfConnected()
    }

    private setActiveToolName(toolName: string) {
      this.state.plannerDetail = `Running ${toolName}.`
      this.renderIfConnected()
    }

    private dispatchPlanEvent(message: string, plan: ToolPlan, planner: ToolPlanner) {
      this.dispatchEvent(new CustomEvent<WebMCPCommandPlanEventDetail>('webmcp-command-plan', {
        bubbles: true,
        composed: true,
        detail: {
          message,
          plan,
          planner
        }
      }))
    }

    private dispatchPlannerEvent(planner: ToolPlanner) {
      this.dispatchEvent(new CustomEvent<WebMCPCommandPlannerEventDetail>('webmcp-command-planner', {
        bubbles: true,
        composed: true,
        detail: {
          planner
        }
      }))
    }

    private dispatchResultEvent(message: string, plan: ToolPlan, result: ToolInvocationResult) {
      this.dispatchEvent(new CustomEvent<WebMCPCommandResultEventDetail>('webmcp-command-result', {
        bubbles: true,
        composed: true,
        detail: {
          message,
          plan,
          result
        }
      }))
    }

    private dispatchErrorEvent(message: string, error: string) {
      this.dispatchEvent(new CustomEvent<WebMCPCommandErrorEventDetail>('webmcp-command-error', {
        bubbles: true,
        composed: true,
        detail: {
          error,
          message
        }
      }))
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
      this.state.provider = provider
      this.state.model = getDefaultModelForProvider(provider)
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
    }

    private handleDiagnosticsToggled(event: Event) {
      const target = event.target
      if (!(target instanceof HTMLDetailsElement)) return
      this.state.diagnosticsOpen = target.open
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

      const provider = this.plannerConfig?.provider ?? this.state.fixedProvider ?? this.state.provider
      const model = this.plannerConfig?.model ?? this.state.fixedModel ?? this.state.model
      const showProviderControl = !this.planner && !this.plannerConfig && !this.state.fixedProvider
      const showModelControl = !this.planner && !this.plannerConfig && !this.state.fixedModel && usesModelInput(provider)
      const showDiagnostics = this.state.hasDiagnostics
      const optionsStatus = this.planner ? this.state.plannerName : getOptionsStatusText(provider, model)
      const statusLabel = getStatusLabel(this.state.phase)
      const buttonLabel = this.running ? statusLabel : this.state.buttonLabel

      this.shadowRoot.innerHTML = `
        <style>${getStyles()}</style>
        <form class="webmcp-command" aria-label="WebMCP command input">
          <label class="webmcp-input-shell">
            <span>WebMCP</span>
            <input
              data-command-input
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="${escapeHtml(this.state.placeholder)}"
              value="${escapeAttribute(this.state.prompt)}"
              ${this.state.disabled ? 'disabled' : ''}
            />
          </label>
          <button type="submit" ${this.running || this.state.disabled ? 'disabled' : ''} aria-busy="${String(this.running)}">
            ${escapeHtml(buttonLabel)}
          </button>
        </form>
        ${showProviderControl || showModelControl ? `
          <details class="webmcp-settings" ${this.state.settingsOpen ? 'open' : ''}>
            <summary class="webmcp-settings-summary">
              <span>Options</span>
              <span class="webmcp-status" aria-live="polite" aria-atomic="true">
                ${escapeHtml(optionsStatus)}
              </span>
            </summary>
            <div class="webmcp-settings-grid">
              ${showProviderControl ? getProviderControlMarkup(provider) : ''}
              ${showModelControl ? getModelControlMarkup(provider, model) : ''}
            </div>
          </details>
        ` : `
          <div class="webmcp-settings webmcp-settings--status-only">
            <div class="webmcp-settings-summary">
              <span>Options</span>
              <span class="webmcp-status" aria-live="polite" aria-atomic="true">
                ${escapeHtml(optionsStatus)}
              </span>
            </div>
          </div>
        `}
        ${showDiagnostics ? `
          <details class="webmcp-diagnostics" ${this.state.diagnosticsOpen ? 'open' : ''}>
            <summary class="webmcp-disclosure-summary">
              <span>Developer diagnostics</span>
            </summary>
            <div class="webmcp-diagnostics-content">
              <slot name="diagnostics"></slot>
            </div>
          </details>
        ` : ''}
      `

      const form = this.shadowRoot.querySelector<HTMLFormElement>('form')
      const input = this.shadowRoot.querySelector<HTMLInputElement>('[data-command-input]')
      const settingsControl = this.shadowRoot.querySelector<HTMLDetailsElement>('.webmcp-settings')
      const diagnosticsControl = this.shadowRoot.querySelector<HTMLDetailsElement>('.webmcp-diagnostics')
      const providerControl = this.shadowRoot.querySelector<HTMLSelectElement>('[data-provider]')
      const modelControl = this.shadowRoot.querySelector<HTMLInputElement | HTMLSelectElement>('[data-model]')

      form?.addEventListener('submit', this.handleSubmit.bind(this))
      input?.addEventListener('input', this.handlePromptChanged.bind(this))
      settingsControl?.addEventListener('toggle', this.handleSettingsToggled.bind(this))
      diagnosticsControl?.addEventListener('toggle', this.handleDiagnosticsToggled.bind(this))
      providerControl?.addEventListener('change', this.handleProviderChanged.bind(this))
      modelControl?.addEventListener('input', this.handleModelChanged.bind(this))
      modelControl?.addEventListener('change', this.handleModelChanged.bind(this))
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
    const toolName = steps.length > 1 ? `${step.toolName} (${index + 1}/${steps.length})` : step.toolName
    setActiveToolName(toolName)
    result = await invokeTool({
      toolName: step.toolName,
      input: step.input,
      source: 'planner'
    })
    if (result.status !== 'success') return result
  }

  return result ?? {
    toolName: plan.toolName,
    status: 'error',
    error: 'Planner returned no executable steps.',
    durationMs: 0
  }
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

async function createCommandInputPlanner(config: PlannerProviderConfig | undefined): Promise<ToolPlanner> {
  if (!config) return createBestPlanner()
  if (config.provider === 'chrome-built-in') return createChromeAIPlanner(false)
  if (config.provider === 'local') return createHeuristicPlanner()

  return createConfiguredPlanner(config)
}

function getProviderControlMarkup(provider: PlannerProviderKind): string {
  return `
    <label>
      <span>Provider</span>
      <select data-provider>
        ${getProviderOptionsMarkup(provider)}
      </select>
    </label>
  `
}

function getProviderOptionsMarkup(provider: PlannerProviderKind): string {
  return getProviderOptions().map(function mapOption(option) {
    return `<option value="${option.value}" ${provider === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`
  }).join('')
}

function getProviderOptions(): Array<{ label: string, value: PlannerProviderKind }> {
  return [
    { label: 'Auto', value: 'auto' },
    { label: 'Chrome built-in AI', value: 'chrome-built-in' },
    { label: 'Local deterministic', value: 'local' },
    { label: 'OpenRouter', value: 'openrouter' },
    { label: 'OpenAI', value: 'openai' },
    { label: 'OpenAI-compatible', value: 'openai-compatible' },
    { label: 'Cloudflare binding', value: 'cloudflare-binding' },
    { label: 'Cloudflare Workers AI', value: 'cloudflare-workers-ai' }
  ]
}

function getOptionsStatusText(provider: PlannerProviderKind, model: string): string {
  const providerLabel = getProviderLabel(provider)
  if (!usesModelInput(provider) || !model) return providerLabel
  return `${providerLabel} - ${getModelLabel(provider, model)}`
}

function getProviderLabel(provider: PlannerProviderKind): string {
  const option = getProviderOptions().find(function findProviderOption(providerOption) {
    return providerOption.value === provider
  })
  return option?.label ?? provider
}

function getModelLabel(provider: PlannerProviderKind, model: string): string {
  const option = getModelOptions(provider).find(function findModelOption(modelOption) {
    return modelOption.value === model
  })
  return option?.label ?? model
}

function getModelControlMarkup(provider: PlannerProviderKind, model: string): string {
  const modelOptions = getModelOptions(provider)
  if (modelOptions.length > 0) {
    return `
      <label>
        <span>Model</span>
        <select data-model>
          ${getModelOptionsMarkup(modelOptions, model)}
        </select>
      </label>
    `
  }

  return `
    <label>
      <span>Model</span>
      <input data-model type="text" value="${escapeAttribute(model)}" />
    </label>
  `
}

function getModelOptionsMarkup(options: ModelOption[], model: string): string {
  return options.map(function mapOption(option) {
    return `<option value="${escapeAttribute(option.value)}" ${model === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`
  }).join('')
}

function getModelOptions(provider: PlannerProviderKind): ModelOption[] {
  if (provider === 'openai') {
    return [
      { label: 'GPT-4.1 mini', value: 'gpt-4.1-mini' },
      { label: 'GPT-4.1', value: 'gpt-4.1' },
      { label: 'GPT-4o mini', value: 'gpt-4o-mini' },
      { label: 'GPT-4o', value: 'gpt-4o' }
    ]
  }

  if (provider === 'openrouter') {
    return [
      { label: 'OpenRouter auto', value: 'openrouter/auto' }
    ]
  }

  if (provider === 'cloudflare-binding' || provider === 'cloudflare-workers-ai') {
    return [
      { label: 'Kimi K2.6', value: '@cf/moonshotai/kimi-k2.6' },
      { label: 'GPT OSS 20B', value: '@cf/openai/gpt-oss-20b' },
      { label: 'GLM 4.7 Flash', value: '@cf/zai-org/glm-4.7-flash' },
      { label: 'Qwen3 30B A3B FP8', value: '@cf/qwen/qwen3-30b-a3b-fp8' },
      { label: 'DeepSeek R1 Distill Qwen 32B', value: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b' },
      { label: 'Qwen QwQ 32B', value: '@cf/qwen/qwq-32b' },
      { label: 'Nemotron 3 120B A12B', value: '@cf/nvidia/nemotron-3-120b-a12b' },
      { label: 'Gemma 4 26B A4B', value: '@cf/google/gemma-4-26b-a4b-it' }
    ]
  }

  return []
}

function getDefaultModelForProvider(provider: PlannerProviderKind): string {
  if (provider === 'openai') return 'gpt-4.1-mini'
  if (provider === 'cloudflare-binding') return '@cf/moonshotai/kimi-k2.6'
  if (provider === 'cloudflare-workers-ai') return '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b'
  if (provider === 'openai-compatible') return ''
  return defaultModel
}

function getStatusLabel(phase: WebMCPCommandInputPhase): string {
  if (phase === 'preparing') return 'Preparing...'
  if (phase === 'planning') return 'Planning...'
  if (phase === 'executing') return 'Running...'
  return defaultButtonLabel
}

function usesModelInput(provider: PlannerProviderKind): boolean {
  return provider === 'openai'
    || provider === 'openrouter'
    || provider === 'openai-compatible'
    || provider === 'cloudflare-binding'
    || provider === 'cloudflare-workers-ai'
}

function isPlannerAttribute(name: string): boolean {
  return name === 'account-id'
    || name === 'api-key'
    || name === 'auth-mode'
    || name === 'base-url'
    || name === 'endpoint'
    || name === 'model'
    || name === 'provider'
}

function isAuthMode(value: unknown): value is 'none' | 'server' | 'user-key' {
  return value === 'none' || value === 'server' || value === 'user-key'
}

function isPlannerProviderKind(value: unknown): value is PlannerProviderKind {
  return value === 'auto'
    || value === 'chrome-built-in'
    || value === 'local'
    || value === 'openai'
    || value === 'openrouter'
    || value === 'openai-compatible'
    || value === 'cloudflare-binding'
    || value === 'cloudflare-workers-ai'
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll('`', '&#96;')
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Command failed.'
}

function assertCustomElementsAvailable() {
  if (typeof customElements === 'undefined' || typeof HTMLElement === 'undefined') {
    throw new Error('WebMCP command input can only be defined in a browser custom elements environment.')
  }
}

function getStyles(): string {
  return `
    :host {
      --webmcp-ink: #121815;
      --webmcp-muted: #66746d;
      --webmcp-line: #dbe5df;
      --webmcp-soft-line: rgba(18, 24, 21, 0.09);
      --webmcp-paper: #fbfcfa;
      --webmcp-panel: #ffffff;
      --webmcp-field: #f4f8f5;
      --webmcp-accent: #1e9f72;
      --webmcp-accent-dark: #0f6f51;
      --webmcp-dark: #09110e;
      display: block;
      position: relative;
      color: var(--webmcp-ink);
      font: 500 0.95rem/1.4 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    .webmcp-command {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.625rem;
      padding: 0.625rem;
      border: 1px solid var(--webmcp-line);
      background: linear-gradient(180deg, #ffffff 0%, var(--webmcp-paper) 100%);
      box-shadow: 0 16px 36px rgba(4, 10, 8, 0.12);
    }

    .webmcp-input-shell {
      display: flex;
      align-items: center;
      min-width: 0;
      gap: 0.625rem;
      padding: 0 0.875rem;
      border: 1px solid var(--webmcp-line);
      background: var(--webmcp-field);
      transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
    }

    .webmcp-input-shell:focus-within {
      border-color: rgba(30, 159, 114, 0.58);
      background: #ffffff;
      box-shadow: 0 0 0 3px rgba(30, 159, 114, 0.12);
    }

    .webmcp-input-shell span {
      flex: 0 0 auto;
      color: var(--webmcp-muted);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    input,
    select,
    button {
      min-width: 0;
      min-height: 2.5rem;
      font: inherit;
    }

    input,
    select {
      width: 100%;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--webmcp-ink);
    }

    select,
    .webmcp-settings input {
      padding: 0 0.75rem;
      border: 1px solid var(--webmcp-line);
      background: #ffffff;
    }

    button {
      padding: 0 1.125rem;
      border: 1px solid var(--webmcp-ink);
      background: var(--webmcp-ink);
      color: #ffffff;
      font-weight: 800;
      white-space: nowrap;
      cursor: pointer;
      transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
    }

    button:hover:not(:disabled) {
      border-color: var(--webmcp-accent-dark);
      background: var(--webmcp-accent-dark);
      transform: translateY(-1px);
    }

    button:disabled {
      cursor: progress;
      opacity: 0.7;
    }

    button:focus-visible,
    summary:focus-visible,
    select:focus-visible,
    .webmcp-settings input:focus-visible {
      outline: 2px solid var(--webmcp-accent);
      outline-offset: 2px;
    }

    .webmcp-settings,
    .webmcp-diagnostics {
      padding: 0;
      border-inline: 1px solid var(--webmcp-line);
      border-bottom: 1px solid var(--webmcp-line);
      background: rgba(255, 255, 255, 0.96);
    }

    .webmcp-settings[open],
    .webmcp-diagnostics[open] {
      background: #ffffff;
    }

    .webmcp-diagnostics {
      padding-bottom: 0;
      position: relative;
    }

    .webmcp-settings-summary,
    .webmcp-disclosure-summary {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      min-height: 2.6rem;
      align-items: center;
      gap: 0.65rem;
      width: 100%;
      padding: 0 0.75rem;
      color: var(--webmcp-muted);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0;
      text-transform: uppercase;
      transition: background 140ms ease, color 140ms ease, box-shadow 140ms ease;
    }

    summary.webmcp-settings-summary,
    summary.webmcp-disclosure-summary {
      cursor: pointer;
      list-style: none;
    }

    summary.webmcp-settings-summary::-webkit-details-marker,
    summary.webmcp-disclosure-summary::-webkit-details-marker {
      display: none;
    }

    summary.webmcp-settings-summary::before,
    summary.webmcp-disclosure-summary::before {
      width: 0.45rem;
      height: 0.45rem;
      border-right: 2px solid currentColor;
      border-bottom: 2px solid currentColor;
      content: "";
      transform: rotate(-45deg);
      transition: transform 140ms ease, color 140ms ease;
    }

    .webmcp-settings[open] > .webmcp-settings-summary::before,
    .webmcp-diagnostics[open] > .webmcp-disclosure-summary::before {
      transform: rotate(45deg);
    }

    .webmcp-settings > summary.webmcp-settings-summary:hover,
    .webmcp-diagnostics > summary.webmcp-disclosure-summary:hover {
      background: #f2f7f4;
      color: var(--webmcp-ink);
    }

    .webmcp-settings[open] > .webmcp-settings-summary,
    .webmcp-diagnostics[open] > .webmcp-disclosure-summary {
      box-shadow: inset 3px 0 0 var(--webmcp-accent);
      color: var(--webmcp-ink);
    }

    .webmcp-settings--status-only .webmcp-settings-summary {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .webmcp-settings-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.625rem;
      padding: 0.55rem 0.75rem 0.75rem;
      border-top: 1px solid var(--webmcp-soft-line);
    }

    .webmcp-settings label {
      display: grid;
      min-width: 0;
      gap: 0.3rem;
      color: var(--webmcp-muted);
      font-size: 0.7rem;
      font-weight: 800;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    .webmcp-diagnostics-content {
      position: absolute;
      z-index: 20;
      top: 100%;
      right: 0;
      left: 0;
      max-height: min(40rem, 68vh);
      overflow: auto;
      margin-inline: 0;
      border: 1px solid rgba(224, 234, 229, 0.18);
      border-top: 0;
      background: var(--webmcp-dark);
      box-shadow: 0 1.2rem 2.5rem rgba(0, 0, 0, 0.32);
    }

    .webmcp-status {
      display: inline-flex;
      min-width: 0;
      gap: 0.45rem;
      align-items: center;
      justify-self: end;
      color: var(--webmcp-muted);
      font-size: 0.8rem;
      font-weight: 500;
      text-transform: none;
    }

    .webmcp-status strong {
      color: var(--webmcp-ink);
      font-size: 0.84rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .webmcp-status span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @media (max-width: 36rem) {
      .webmcp-command,
      .webmcp-settings-grid {
        grid-template-columns: 1fr;
      }

      button {
        width: 100%;
      }
    }
  `
}
