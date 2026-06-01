export interface WebMCPModelContext {
  registerTool?: (...args: unknown[]) => unknown
}

interface DocumentWithModelContext extends Document {
  modelContext?: WebMCPModelContext
}

interface NavigatorWithModelContext extends Navigator {
  modelContext?: WebMCPModelContext
}

export function isWebMCPSupported(): boolean {
  return getWebMCPModelContext() !== undefined
}

export function getWebMCPModelContext(): WebMCPModelContext | undefined {
  if (typeof document !== 'undefined') {
    const modelContext = (document as DocumentWithModelContext).modelContext
    if (typeof modelContext?.registerTool === 'function') return modelContext
  }

  if (typeof navigator !== 'undefined') {
    const modelContext = (navigator as NavigatorWithModelContext).modelContext
    if (typeof modelContext?.registerTool === 'function') return modelContext
  }

  return undefined
}

export function getSupportLabel(): string {
  if (isWebMCPSupported()) {
    return 'Native WebMCP available'
  }

  return 'Fallback registry active'
}
