export interface BrowserLocalAIPlannerOptions {
  contextWindowSize?: number
  model: string
}

export interface BrowserLocalAIModelOption {
  contextWindowSize?: number
  label: string
  model: string
}

export interface NavigatorWithGpu {
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
    },
    chatOptions?: {
      context_window_size?: number
    }
  ) => Promise<WebLLMEngine>
}
