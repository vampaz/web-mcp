import { defineWebMCPCommandInput } from './command-input'
import { setConfirmationHandler } from './confirmation'
import { assertValidTool } from './define-tool'
import type { WebMCPCommandInputElement } from './interfaces/command-input'
import type {
  ConfirmationHandler,
  ResolverContext,
  RegisteredTool,
  RegisteredTools,
  ToolResolver,
  WebMCPTool
} from './interfaces/tool'
import { getTool, registerTools } from './registry'

export interface InitWebMCPOptions {
  buttonLabel?: string
  confirmationHandler?: ConfirmationHandler
  context?: ResolverContext | (() => ResolverContext)
  /** Shows the floating panel launcher. Default `true` for an element created by `initWebMCP()`. */
  launcher?: boolean
  placeholder?: string
  resolver?: ToolResolver
  target?: string | WebMCPCommandInputElement
  tools?: readonly WebMCPTool[]
}

export interface WebMCPInitHandle {
  element: WebMCPCommandInputElement
  resolver?: ToolResolver
  registrations: RegisteredTool[]
  destroy: () => void
}

export function initWebMCP(options: InitWebMCPOptions = {}): WebMCPInitHandle {
  if (typeof document === 'undefined') {
    throw new Error('initWebMCP() must run in a browser document context.')
  }

  // Resolve everything that can throw before performing side effects.
  assertRegistrableInitTools(options.tools)
  const resolver = options.resolver
  defineWebMCPCommandInput()
  const { created, element } = resolveCommandInputElement(options.target)

  let disposeConfirmation: (() => void) | undefined
  let registered: RegisteredTools | undefined

  function rollback() {
    registered?.unregister()
    disposeConfirmation?.()
    if (created) {
      element.remove()
      return
    }
    // A host-supplied element outlives the handle, so drop what this call configured on it.
    if (resolver && element.resolver === resolver) element.configure({ resolver: undefined })
    if (options.context !== undefined && element.context === options.context)
      element.configure({ context: undefined })
  }

  try {
    registered = registerTools(options.tools ?? [])

    if (options.confirmationHandler) {
      disposeConfirmation = setConfirmationHandler(options.confirmationHandler)
    }

    element.configure({
      ...(options.buttonLabel !== undefined ? { buttonLabel: options.buttonLabel } : {}),
      ...(options.context !== undefined ? { context: options.context } : {}),
      // A created element floats closed, so it needs a visible way to open.
      ...(options.launcher !== undefined || created ? { launcher: options.launcher ?? true } : {}),
      ...(options.placeholder !== undefined ? { placeholder: options.placeholder } : {}),
      ...(resolver ? { resolver } : {})
    })
  } catch (error) {
    rollback()
    throw error
  }

  return {
    element,
    resolver,
    registrations: registered.registrations,
    destroy: rollback
  }
}

function assertRegistrableInitTools(tools: readonly WebMCPTool[] | undefined): void {
  if (!tools) return

  const names = new Set<string>()
  for (const tool of tools) {
    assertValidTool(tool)
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
