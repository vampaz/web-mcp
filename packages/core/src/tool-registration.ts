import { registerTool, type RegisteredTool, type WebMCPTool } from '@vampaz/webmcp-kit'

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
