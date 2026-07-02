import { defineWebMCPCommandInput } from './command-input'
import { getConfirmationHandler, setConfirmationHandler } from './confirmation'
import { assertValidTool } from './define-tool'
import { createHostedOpenAIPlanner } from './hosted-openai-planner'
import type { WebMCPCommandInputElement } from './interfaces/command-input'
import type {
  AnyWebMCPTool,
  ConfirmationHandler,
  PlannerContext,
  RegisteredTool,
  ToolPlanner,
  WebMCPTool
} from './interfaces/tool'
import { getTool, registerTool } from './registry'

interface ConfirmationHandlerFrame {
  handler: ConfirmationHandler
  owner: symbol
}

const confirmationHandlerFrames: ConfirmationHandlerFrame[] = []
let baseConfirmationHandler: ConfirmationHandler | undefined

export interface InitWebMCPOptions {
  accessKey?: string
  baseUrl?: string
  browserChallengeSiteKey?: string
  buttonLabel?: string
  confirmationHandler?: ConfirmationHandler
  context?: PlannerContext | (() => PlannerContext)
  model?: string
  placeholder?: string
  planner?: ToolPlanner
  target?: string | WebMCPCommandInputElement
  tools?: readonly AnyWebMCPTool[]
}

export interface WebMCPInitHandle {
  element: WebMCPCommandInputElement
  planner?: ToolPlanner
  registrations: RegisteredTool[]
  destroy: () => void
}

/**
 * One-call setup: registers tools, defines and locates (or creates) the
 * command input element, and wires a planner.
 *
 * With an `accessKey`, planning runs through the hosted OpenAI planner using
 * endpoints derived from `baseUrl`. Without one, the element keeps its own
 * default planner behavior.
 *
 * Tool names must be unique and must not collide with already-registered
 * tools. A throwing call leaves no side effects behind, and `destroy()`
 * restores the confirmation handler that was active before this call.
 */
export function initWebMCP(options: InitWebMCPOptions = {}): WebMCPInitHandle {
  if (typeof document === 'undefined') {
    throw new Error('initWebMCP() must run in a browser document context.')
  }

  // Resolve everything that can throw before performing side effects.
  assertRegistrableInitTools(options.tools)
  const planner = options.planner ?? createDefaultHostedPlanner(options)
  defineWebMCPCommandInput()
  const { created, element } = resolveCommandInputElement(options.target)

  const confirmationOwner = Symbol('webmcp-init-confirmation-handler')
  const registrations: RegisteredTool[] = []

  function rollback() {
    for (const registration of registrations) {
      registration.unregister()
    }
    releaseConfirmationHandler(confirmationOwner)
    if (created) element.remove()
  }

  try {
    for (const tool of options.tools ?? []) {
      registrations.push(registerTool(tool as unknown as WebMCPTool))
    }

    if (options.confirmationHandler) {
      installConfirmationHandler(confirmationOwner, options.confirmationHandler)
    }

    element.configure({
      ...(options.buttonLabel !== undefined ? { buttonLabel: options.buttonLabel } : {}),
      ...(options.context !== undefined ? { context: options.context } : {}),
      ...(options.placeholder !== undefined ? { placeholder: options.placeholder } : {}),
      ...(planner ? { planner } : {})
    })
  } catch (error) {
    rollback()
    throw error
  }

  if (created) element.openPanel()

  return {
    element,
    planner,
    registrations,
    destroy: rollback
  }
}

function assertRegistrableInitTools(tools: readonly AnyWebMCPTool[] | undefined): void {
  if (!tools) return

  const names = new Set<string>()
  for (const tool of tools) {
    assertValidTool(tool as unknown as WebMCPTool)
    if (names.has(tool.name)) {
      throw new Error(`initWebMCP() received duplicate tool name "${tool.name}".`)
    }
    names.add(tool.name)
    if (getTool(tool.name)) {
      throw new Error(
        `initWebMCP() cannot register "${tool.name}" because a tool with that name is already registered. Unregister it first or rename the tool.`
      )
    }
  }
}

function installConfirmationHandler(owner: symbol, handler: ConfirmationHandler): void {
  if (confirmationHandlerFrames.length === 0) {
    baseConfirmationHandler = getConfirmationHandler()
  }
  confirmationHandlerFrames.push({ handler, owner })
  setConfirmationHandler(handler)
}

function releaseConfirmationHandler(owner: symbol): void {
  const index = confirmationHandlerFrames.findIndex(function findOwnedFrame(frame) {
    return frame.owner === owner
  })
  if (index === -1) return

  const [frame] = confirmationHandlerFrames.splice(index, 1)
  const wasActive = index === confirmationHandlerFrames.length
  const restoredHandler = confirmationHandlerFrames.at(-1)?.handler ?? baseConfirmationHandler
  if (confirmationHandlerFrames.length === 0) {
    baseConfirmationHandler = undefined
  }

  if (!wasActive) return
  // Leave a handler alone when the consumer replaced it after this install.
  if (getConfirmationHandler() !== frame?.handler) return

  setConfirmationHandler(restoredHandler)
}

function createDefaultHostedPlanner(options: InitWebMCPOptions): ToolPlanner | undefined {
  if (!options.accessKey) return undefined

  if (!options.model) {
    throw new Error('initWebMCP() needs a "model" when "accessKey" is provided.')
  }

  return createHostedOpenAIPlanner({
    accessKey: options.accessKey,
    baseUrl: options.baseUrl,
    browserChallengeSiteKey: options.browserChallengeSiteKey,
    model: options.model
  })
}

function resolveCommandInputElement(target: string | WebMCPCommandInputElement | undefined): {
  created: boolean
  element: WebMCPCommandInputElement
} {
  if (target && typeof target !== 'string') {
    return { created: false, element: target }
  }

  if (typeof target === 'string') {
    const element = document.querySelector<WebMCPCommandInputElement>(target)
    if (!element) {
      throw new Error(`initWebMCP() found no element matching "${target}".`)
    }
    return { created: false, element }
  }

  const existing = document.querySelector<WebMCPCommandInputElement>('webmcp-command-input')
  if (existing) {
    return { created: false, element: existing }
  }

  const element = document.createElement('webmcp-command-input') as WebMCPCommandInputElement
  element.setAttribute('floating', '')
  document.body.append(element)
  return { created: true, element }
}
