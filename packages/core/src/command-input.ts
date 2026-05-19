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
  WebMCPCommandResultEventDetail
} from './interfaces/command-input'
import { createBestPlanner, createConfiguredPlanner } from './planner'
import { invokeTool, listTools } from './registry'

type CommandInputConstructor = CustomElementConstructor & {
  observedAttributes: string[]
}

type CommandInputRuntimeState = {
  buttonLabel: string
  disabled: boolean
  fixedModel?: string
  fixedProvider?: PlannerProviderKind
  model: string
  phase: WebMCPCommandInputPhase
  placeholder: string
  prompt: string
  plannerDetail: string
  plannerName: string
  provider: PlannerProviderKind
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
    private plannerLoadId = 0
    private plannerRevision = 0
    private providedPlanner?: ToolPlanner
    private providedPlannerConfig?: PlannerProviderConfig
    private running = false
    private readonly state: CommandInputRuntimeState = {
      buttonLabel: defaultButtonLabel,
      disabled: false,
      model: defaultModel,
      phase: 'idle',
      placeholder: defaultPlaceholder,
      prompt: '',
      plannerDetail: 'Planner is waiting for a command.',
      plannerName: 'Planner',
      provider: 'auto'
    }

    constructor() {
      super()
      this.attachShadow({ mode: 'open' })
    }

    connectedCallback() {
      this.isConnectedToDom = true
      this.syncAttributes()
      this.render()
      void this.refreshPlannerStatus()
    }

    disconnectedCallback() {
      this.isConnectedToDom = false
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
        return this.planner
      }

      const plannerConfig = this.getPlannerConfig()
      const plannerSignature = JSON.stringify(plannerConfig ?? { provider: 'auto' })
      if (this.currentPlanner && this.currentPlannerSignature === plannerSignature) return this.currentPlanner

      this.disposeCreatedPlanner()
      const loadId = this.plannerLoadId + 1
      this.plannerLoadId = loadId
      const revision = this.plannerRevision
      const planner = plannerConfig ? await createConfiguredPlanner(plannerConfig) : await createBestPlanner()
      if (revision !== this.plannerRevision || loadId !== this.plannerLoadId) {
        planner.dispose?.()
        throw new Error(supersededPlannerRefreshMessage)
      }

      this.currentPlanner = planner
      this.currentPlannerWasCreated = true
      this.currentPlannerSignature = plannerSignature
      this.state.plannerName = `${this.currentPlanner.name} (${this.currentPlanner.status})`
      this.state.plannerDetail = this.currentPlanner.detail
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
      this.invalidatePlanner()
      this.render()
      void this.refreshPlannerStatus()
    }

    private handleModelChanged(event: Event) {
      const target = event.target
      if (!(target instanceof HTMLInputElement)) return
      this.state.model = target.value
      this.invalidatePlanner()
      void this.refreshPlannerStatus()
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

      const provider = this.state.fixedProvider ?? this.state.provider
      const model = this.state.fixedModel ?? this.state.model
      const showProviderControl = !this.planner && !this.plannerConfig && !this.state.fixedProvider
      const showModelControl = !this.planner && !this.plannerConfig && !this.state.fixedModel && usesModelInput(provider)
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
          <details class="webmcp-settings">
            <summary>Options</summary>
            <div class="webmcp-settings-grid">
              ${showProviderControl ? getProviderControlMarkup(provider) : ''}
              ${showModelControl ? getModelControlMarkup(model) : ''}
            </div>
          </details>
        ` : ''}
        <p class="webmcp-status" aria-live="polite" aria-atomic="true">
          <strong>${escapeHtml(this.state.plannerName)}</strong>
          <span>${escapeHtml(this.state.plannerDetail)}</span>
        </p>
      `

      const form = this.shadowRoot.querySelector<HTMLFormElement>('form')
      const input = this.shadowRoot.querySelector<HTMLInputElement>('[data-command-input]')
      const providerControl = this.shadowRoot.querySelector<HTMLSelectElement>('[data-provider]')
      const modelControl = this.shadowRoot.querySelector<HTMLInputElement>('[data-model]')

      form?.addEventListener('submit', this.handleSubmit.bind(this))
      input?.addEventListener('input', this.handlePromptChanged.bind(this))
      providerControl?.addEventListener('change', this.handleProviderChanged.bind(this))
      modelControl?.addEventListener('input', this.handleModelChanged.bind(this))
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
  const options: Array<{ label: string, value: PlannerProviderKind }> = [
    { label: 'Auto', value: 'auto' },
    { label: 'Chrome built-in AI', value: 'chrome-built-in' },
    { label: 'Local deterministic', value: 'local' },
    { label: 'OpenRouter', value: 'openrouter' },
    { label: 'OpenAI', value: 'openai' },
    { label: 'OpenAI-compatible', value: 'openai-compatible' },
    { label: 'Cloudflare binding', value: 'cloudflare-binding' },
    { label: 'Cloudflare Workers AI', value: 'cloudflare-workers-ai' }
  ]

  return options.map(function mapOption(option) {
    return `<option value="${option.value}" ${provider === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`
  }).join('')
}

function getModelControlMarkup(model: string): string {
  return `
    <label>
      <span>Model</span>
      <input data-model type="text" value="${escapeAttribute(model)}" />
    </label>
  `
}

function getDefaultModelForProvider(provider: PlannerProviderKind): string {
  if (provider === 'openai') return 'gpt-4.1-mini'
  if (provider === 'cloudflare-binding') return '@cf/google/gemma-4-26b-a4b-it'
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
      display: block;
      color: #101514;
      font: 500 0.95rem/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    .webmcp-command {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0.5rem;
      padding: 0.5rem;
      border: 1px solid #cfd8d2;
      background: #ffffff;
    }

    .webmcp-input-shell {
      display: flex;
      align-items: center;
      min-width: 0;
      gap: 0.625rem;
      padding: 0 0.75rem;
      border: 1px solid #cfd8d2;
      background: #f7faf8;
    }

    .webmcp-input-shell span,
    .webmcp-settings label span {
      flex: 0 0 auto;
      color: #5f6f68;
      font-size: 0.75rem;
      font-weight: 800;
      text-transform: uppercase;
    }

    input,
    select,
    button {
      min-width: 0;
      min-height: 2.5rem;
      border-radius: 0;
      font: inherit;
    }

    input,
    select {
      width: 100%;
      border: 0;
      outline: 0;
      background: transparent;
      color: #101514;
    }

    select,
    .webmcp-settings input {
      padding: 0 0.625rem;
      border: 1px solid #cfd8d2;
      background: #ffffff;
    }

    button {
      padding: 0 1rem;
      border: 1px solid #101514;
      background: #101514;
      color: #ffffff;
      font-weight: 800;
      white-space: nowrap;
    }

    button:disabled {
      cursor: progress;
      opacity: 0.7;
    }

    .webmcp-input-shell:focus-within,
    button:focus-visible,
    summary:focus-visible,
    select:focus-visible,
    .webmcp-settings input:focus-visible {
      outline: 2px solid #2b7fff;
      outline-offset: 2px;
    }

    .webmcp-settings {
      padding: 0.35rem 0.5rem 0.5rem;
      border-inline: 1px solid #cfd8d2;
      border-bottom: 1px solid #cfd8d2;
      background: #ffffff;
    }

    summary {
      display: inline-flex;
      min-height: 1.75rem;
      align-items: center;
      cursor: pointer;
      color: #5f6f68;
      font-size: 0.75rem;
      font-weight: 800;
      text-transform: uppercase;
    }

    .webmcp-settings-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem;
      padding-block-start: 0.35rem;
    }

    .webmcp-settings label {
      display: grid;
      min-width: 0;
      gap: 0.25rem;
    }

    .webmcp-status {
      display: grid;
      gap: 0.15rem;
      margin: 0.4rem 0 0;
      color: #5f6f68;
      font-size: 0.82rem;
    }

    .webmcp-status strong {
      color: #101514;
      font-size: 0.84rem;
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
