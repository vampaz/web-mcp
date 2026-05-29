import type { Ai } from '@cloudflare/workers-types'

export interface CloudflareEnv {
  AI?: Ai
  OPENAI_API_KEY?: string
  OPENROUTER_API_KEY?: string
}
