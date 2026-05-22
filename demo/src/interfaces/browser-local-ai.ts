export interface BrowserLocalAIPlannerOptions {
  model: string
}

export interface NavigatorWithGpu extends Navigator {
  gpu?: {
    requestAdapter: () => Promise<unknown>
  }
}

export interface WebLLMInitProgressReport {
  progress?: number
  text?: string
}

export interface WebLLMChatCompletion {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

export interface WebLLMEngine {
  chat: {
    completions: {
      create: (request: Record<string, unknown>) => Promise<WebLLMChatCompletion>
    }
  }
  unload?: () => Promise<void> | void
}

export interface WebLLMModule {
  CreateMLCEngine: (
    model: string,
    config?: {
      initProgressCallback?: (report: WebLLMInitProgressReport) => void
    }
  ) => Promise<WebLLMEngine>
}
