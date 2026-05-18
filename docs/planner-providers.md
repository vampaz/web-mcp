# Planner Providers

WebMCP Kit can plan tool calls with different model providers. The app still owns tools, schemas, guards, confirmations, and execution. Providers only choose which registered tool to call and which JSON input to pass.

## Production: Server Mode

Use server mode when the key belongs to the app or company.

```ts
import { createWebMCPKit } from '@webmcp-kit/core'

const kit = await createWebMCPKit({
  planner: {
    provider: 'openrouter',
    model: 'openrouter/auto',
    auth: {
      mode: 'server',
      endpoint: '/api/webmcp/plan'
    }
  }
})
```

The browser sends the planning request to `endpoint`. The server or Worker stores the provider secret and calls OpenRouter, OpenAI, Cloudflare Workers AI, or another provider. This is the right mode for public apps and SaaS products.

## Simple Experiments: User-Key Mode

Use user-key mode when the key belongs to the person using the browser, or for local experiments.

```ts
const kit = await createWebMCPKit({
  planner: {
    provider: 'openrouter',
    model: 'openrouter/auto',
    auth: {
      mode: 'user-key',
      apiKey: userProvidedKey
    }
  }
})
```

This has no server hop, but the key is visible to the page and browser developer tools. Do not use user-key mode for shared production app secrets.

## Provider Examples

Chrome built-in AI:

```ts
await createWebMCPKit({
  planner: {
    provider: 'chrome-built-in',
    auth: { mode: 'none' }
  }
})
```

OpenAI:

```ts
await createWebMCPKit({
  planner: {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    auth: {
      mode: 'user-key',
      apiKey: userProvidedOpenAIKey
    }
  }
})
```

OpenAI-compatible endpoint:

```ts
await createWebMCPKit({
  planner: {
    provider: 'openai-compatible',
    model: 'qwen-coder',
    baseUrl: 'http://localhost:1234/v1',
    auth: {
      mode: 'user-key',
      apiKey: localEndpointKey
    }
  }
})
```

Cloudflare Workers AI through the Astro Cloudflare adapter:

```ts
await createWebMCPKit({
  planner: {
    provider: 'cloudflare-workers-ai',
    model: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
    auth: {
      mode: 'server',
      endpoint: '/api/webmcp/plan'
    }
  }
})
```

The demo includes `/api/webmcp/plan` for Cloudflare server planning. For `provider: 'cloudflare-workers-ai'`, that route uses `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` from the server environment. For `provider: 'cloudflare-binding'`, it uses the Astro Cloudflare adapter and expects a Cloudflare runtime with `env.AI`.

For local development, keep Wrangler authentication in an ignored project `.env` file instead of relying on the global interactive OAuth refresh token:

```sh
cp demo/.env.example demo/.env
```

Then fill in `CLOUDFLARE_API_TOKEN`. `CLOUDFLARE_ACCOUNT_ID` is already present in `demo/.env.example` for this project. This keeps `npm run dev` and remote AI bindings on stable project-local credentials while avoiding committed secrets.

Cloudflare binding mode for local development and preview deployments:

```ts
await createWebMCPKit({
  planner: {
    provider: 'cloudflare-binding',
    model: '@cf/google/gemma-4-26b-a4b-it',
    auth: {
      mode: 'server',
      endpoint: '/api/webmcp/plan'
    }
  }
})
```

This mode is intentionally endpoint-only. The browser never receives a Cloudflare token; it sends the selected model and planning payload to the app endpoint. The demo app is configured with `@astrojs/cloudflare`, `demo/src/worker.ts`, and `demo/wrangler.toml`; `demo/wrangler.toml` declares the `AI` binding with `remote = true`, and Astro enables remote bindings by default, so local development, preview deployments, and production deployments use the real Cloudflare Workers AI binding.

For local binding mode, start the dev server normally:

```sh
npm run dev
```

When a provider is explicitly selected, WebMCP Kit uses that provider. It does not silently switch the command to deterministic local planning.

For the separate `cloudflare-workers-ai` REST mode, use the same `.env` values or another server environment that provides `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.

The handler shape is:

```ts
interface Env {
  AI: Ai
}

export default {
  async fetch(request: Request, env: Env) {
    const body = await request.json() as {
      model: string
      message: string
      tools: unknown[]
      context: unknown
    }

    const result = await env.AI.run(body.model, {
      messages: [
        {
          role: 'system',
          content: 'Return only a JSON WebMCP tool plan.'
        },
        {
          role: 'user',
          content: JSON.stringify(body)
        }
      ],
      temperature: 0
    })

    return Response.json(JSON.parse(result.response))
  }
}
```

## Devtools Selection

If an app does not provide a planner config, development builds can expose a provider selector. That selector should be honest about auth mode:

- Server endpoint: safer for app-owned keys.
- User key in browser: simpler, but visible to the page.

WebMCP Kit validates provider output before invocation. If a provider fails, returns malformed JSON, or selects an unknown tool, the planner falls back to deterministic local planning.
