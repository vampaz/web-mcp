import { handle } from '@astrojs/cloudflare/handler'

import type { CloudflareEnv, CloudflareExecutionContext } from '@/interfaces/cloudflare'

const cloudflareHandle = handle as unknown as (
  request: Request,
  env: CloudflareEnv,
  ctx: CloudflareExecutionContext
) => Promise<Response>

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: CloudflareExecutionContext) {
    return cloudflareHandle(request, env, ctx)
  }
}
