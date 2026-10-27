export interface WebMCPChatSettings {
  providers: readonly {
    id: string
    label: string
    models: readonly { model: string; label: string }[]
  }[]
  providerId: string
  model?: string
  detail?: string
  error?: string
  /** Disable changes while the application is switching providers or running a turn. */
  disabled?: boolean
  onChange(providerId: string, model?: string): void
  /** Omit when the application does not offer an approval preference. */
  confirmations?: {
    enabled: boolean
    onChange(enabled: boolean): void
  }
}
