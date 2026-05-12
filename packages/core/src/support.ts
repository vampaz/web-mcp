interface NavigatorWithModelContext extends Navigator {
  modelContext?: {
    registerTool?: (...args: unknown[]) => unknown
  }
}

export function isWebMCPSupported(): boolean {
  if (typeof navigator === 'undefined') return false

  const modelContext = (navigator as NavigatorWithModelContext).modelContext
  return typeof modelContext?.registerTool === 'function'
}

export function getSupportLabel(): string {
  if (isWebMCPSupported()) {
    return 'Native WebMCP available'
  }

  return 'Fallback registry active'
}
