import type { Ai } from '@cloudflare/workers-types'

export interface CloudflareEnv {
  AI?: Ai
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_API_TOKEN?: string
  OPENAI_API_KEY?: string
}
