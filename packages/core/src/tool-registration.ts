import {
  registerTool,
  registerTools,
  type RegisteredTool,
  type RegisteredTools,
  type WebMCPTool
} from '@vampaz/webmcp-kit'

export function createToolRegistrationHandle<TInput, TOutput>(tool: WebMCPTool<TInput, TOutput>) {
  let registration: RegisteredTool<TInput, TOutput> | undefined

  function unregister() {
    registration?.unregister()
    registration = undefined
  }

  return {
    unregister,
    getRegistration() {
      return registration
    },
    sync(available: boolean) {
      if (!available) unregister()
      else if (!registration) registration = registerTool(tool)
    }
  }
}

export function createToolsRegistrationHandle(tools: readonly WebMCPTool[]) {
  let registered: RegisteredTools | undefined

  function unregister() {
    registered?.unregister()
    registered = undefined
  }

  return {
    unregister,
    getRegistrations() {
      return registered?.registrations ?? []
    },
    sync(available: boolean) {
      if (!available) unregister()
      else if (!registered) registered = registerTools(tools)
    }
  }
}
