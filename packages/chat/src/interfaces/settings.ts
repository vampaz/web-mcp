export type WebMCPChatProviderIcon = 'cloud' | 'route' | 'server' | 'chip'

export interface WebMCPChatModelOption {
  model: string
  label: string
  /** Secondary line in the model picker, such as the context size. */
  detail?: string
  /** Short tag beside the option, such as `Experimental`. */
  badge?: string
}

export interface WebMCPChatProvider {
  id: string
  label: string
  /** Short note beside the provider heading in the model picker. */
  description?: string
  /** Secondary line for a provider offered without models. */
  detail?: string
  /** Short tag for a provider offered without models. */
  badge?: string
  icon?: WebMCPChatProviderIcon
  models: readonly WebMCPChatModelOption[]
}

export interface WebMCPChatSettings {
  providers: readonly WebMCPChatProvider[]
  providerId: string
  model?: string
  detail?: string
  error?: string
  /** Disable changes while the application is switching providers or running a turn. */
  disabled?: boolean
  /**
   * Called when the user picks a model. `model` is absent for a provider offered without models.
   */
  onChange(providerId: string, model?: string): void
  /** Omit when the application does not offer an approval preference. */
  confirmations?: {
    enabled: boolean
    onChange(enabled: boolean): void
  }
}
