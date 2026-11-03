export interface LanguageModelSession {
  contextWindow?: number
  inputQuota?: number
  clone: (options?: { signal?: AbortSignal }) => Promise<LanguageModelSession>
  prompt: (
    message: string,
    options?: { responseConstraint?: unknown; signal?: AbortSignal }
  ) => Promise<string>
  destroy?: () => void
  dispose?: () => void
}

export type ChromeSessionState = { sessions: readonly LanguageModelSession[] } & (
  | { kind: 'empty' }
  | { kind: 'creating'; promise: Promise<LanguageModelSession>; progress: number }
  | { kind: 'ready'; session: LanguageModelSession }
  | { kind: 'disposed' }
)

export type ChromeSessionEvent =
  | { type: 'create'; promise: Promise<LanguageModelSession> }
  | { type: 'resolve'; promise: Promise<LanguageModelSession>; session: LanguageModelSession }
  | { type: 'reject'; promise: Promise<LanguageModelSession> }
  | { type: 'progress'; loaded: number }
  | { type: 'cloned' | 'release'; session: LanguageModelSession }
  | { type: 'dispose' }
