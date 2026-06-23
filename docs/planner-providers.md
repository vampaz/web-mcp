# Planner Providers

WebMCP Kit can plan tool calls with different model providers. The app still owns tools, schemas, guards, confirmations, and execution. Providers choose which registered tool to call and which JSON input to pass. For requests that need multiple app actions, providers can return a short ordered `tool_sequence`; for requests that cannot run, they can return `needs_clarification` or `no_tools_match`.

## Production: Server Mode

Use server mode when the key belongs to the app or company.

```ts
import { createWebMCPKit } from '@vampaz/webmcp-kit'

const kit = await createWebMCPKit({
  planner: {
    provider: 'openrouter',
    model: 'nvidia/nemotron-3-super-120b-a12b:free',
    auth: {
      mode: 'server',
      endpoint: '/api/webmcp/plan'
    }
  }
})
```

The browser sends the planning request to `endpoint`. The server or Worker stores the provider secret and calls OpenRouter, OpenAI, Cloudflare Workers AI, or another provider. This is the right mode for public apps and SaaS products.

## WebMCP-Hosted Paid Services

Apps that do not want to operate a backend can call WebMCP-hosted services directly from the browser. In that setup, the app configures a WebMCP-hosted endpoint plus paid-service metadata, and the browser sends a publishable WebMCP access key to that endpoint. The key is visible by design, so it must never grant account-wide or provider-secret privileges.

Hosted OpenAI planning is the first paid service, but the same metadata is intentionally generic enough for analytics, hosted evals, usage dashboards, or later WebMCP services. Missing or invalid keys should disable or fail only the configured hosted paid service. Native WebMCP, deterministic local planning, Chrome built-in AI, browser-local planners, BYOK/user-key providers, and app-owned server endpoints do not require a WebMCP access key.

Some WebMCP-hosted services may optionally mint short-lived service session tokens after validating the publishable key and abuse controls. This is a server-side hardening layer; it does not make browser publishable keys secret and does not require the customer to run a backend.

## Simple Experiments: User-Key Mode

Use user-key mode when the key belongs to the person using the browser, or for local experiments.

```ts
const kit = await createWebMCPKit({
  planner: {
    provider: 'openrouter',
    model: 'nvidia/nemotron-3-super-120b-a12b:free',
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
    model: 'gpt-5.4-mini',
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

Cloudflare Workers AI through the Astro Cloudflare adapter binding:

```ts
await createWebMCPKit({
  planner: {
    provider: 'cloudflare-binding',
    model: '@cf/zai-org/glm-4.7-flash',
    auth: {
      mode: 'server',
      endpoint: '/api/webmcp/plan'
    }
  }
})
```

The demo includes `/api/webmcp/plan` for server planning. For `provider: 'cloudflare-binding'`, it uses the Astro Cloudflare adapter and expects a Cloudflare runtime with `env.AI`. For `provider: 'openrouter'`, it uses `OPENROUTER_API_KEY` from the server environment when OpenRouter is selected.
For `provider: 'openai'`, it uses `OPENAI_API_KEY` from the server environment when OpenAI is selected.

For local development, keep Wrangler authentication in an ignored project `.env` file instead of relying on the global interactive OAuth refresh token:

```sh
cp .env.example .env
```

Then fill in `CLOUDFLARE_API_TOKEN`. `CLOUDFLARE_ACCOUNT_ID` is already present in the demo repo's `.env.example`. Add `OPENAI_API_KEY` or `OPENROUTER_API_KEY` only if you want to use those provider modes. This keeps `npm run dev` and remote AI bindings on stable project-local credentials while avoiding committed secrets.

Keep `.dev.vars` for Worker runtime values only. Do not put `CLOUDFLARE_API_TOKEN` there; Wrangler reads system authentication from the process environment / `.env`, while `.dev.vars` is loaded into the local Worker runtime.

Cloudflare binding mode for local development and preview deployments:

```ts
await createWebMCPKit({
  planner: {
    provider: 'cloudflare-binding',
    model: '@cf/zai-org/glm-4.7-flash',
    auth: {
      mode: 'server',
      endpoint: '/api/webmcp/plan'
    }
  }
})
```

This mode is intentionally endpoint-only. The browser never receives a Cloudflare token; it sends the selected model and planning payload to the app endpoint. The standalone demo app is configured with `@astrojs/cloudflare` and `wrangler.toml`; `wrangler.toml` uses the Astro Cloudflare adapter entrypoint, declares the `AI` binding with `remote = true`, and Astro enables remote bindings by default, so local development, preview deployments, and production deployments use the real Cloudflare Workers AI binding.

For local binding mode, start the dev server normally:

```sh
npm run dev
```

When a provider is explicitly selected, WebMCP Kit uses that provider. It does not silently switch the command to deterministic local planning.

Pass the selected planner to `getIntegrationHealthReport({ planner })` during development to expose provider readiness in the same diagnostics used by the devtools overlay.

## Web Component Input

`@vampaz/webmcp-kit` also exports a ready-made web component for apps that want a command input without building their own planner UI:

```ts
import { defineWebMCPCommandInput } from '@vampaz/webmcp-kit'

defineWebMCPCommandInput()
```

```html
<webmcp-command-input
  provider="cloudflare-binding"
  model="@cf/zai-org/glm-4.7-flash"
  endpoint="/api/webmcp/plan"
></webmcp-command-input>
```

Provider and model controls are only shown when the app has not fixed those values through attributes, properties, `configure()`, or a supplied `plannerConfig`, and when the available planner options contain a real choice.

Chrome built-in AI is not a server endpoint. The command input detects the browser `LanguageModel` API and adds the Chrome built-in AI provider automatically when it is available. Apps can hide that local provider:

```ts
commandInput.configure({
  showChromeAI: false
})
```

In local development, omit fixed `provider` and `model` values and pass the endpoint options your app supports if you want the command input to expose planner controls. If the app passes only one endpoint option, the options panel stays hidden because there is nothing to choose.

```ts
commandInput.configure({
  context: getPlannerContext,
  endpoint: '/api/webmcp/plan',
  endpointOptions: [
    {
      label: 'GPT-5.4 mini',
      model: 'gpt-5.4-mini',
      provider: 'openai'
    },
    {
      label: 'Nemotron 3 Super 120B A12B',
      model: 'nvidia/nemotron-3-super-120b-a12b:free',
      provider: 'openrouter'
    },
    {
      label: 'Nemotron Nano 9B V2',
      model: 'nvidia/nemotron-nano-9b-v2:free',
      provider: 'openrouter'
    },
    {
      label: 'GLM 4.7 Flash',
      model: '@cf/zai-org/glm-4.7-flash',
      provider: 'cloudflare-binding'
    },
    {
      label: 'Auto',
      provider: 'auto'
    },
    {
      label: 'Local deterministic',
      provider: 'local'
    }
  ]
})
```

`endpointOptions` lets the app provide the concrete planner endpoints it has tested and allows through its server route. Provider-only options such as `auto` and `local` can omit `model`. The command input only renders those choices; it does not own the demo's OpenRouter, OpenAI, Cloudflare, or app-specific planner curation.

Use `plannerOptions` for app-owned planners such as a WebLLM browser-local planner or a demo-specific deterministic planner. `initialPlannerOptionId` and `initialModel` set default selections without fixing the provider for the user. `settingsOpen` controls the options disclosure when the command input renders.

```ts
interface BrowserLocalAIModelOption {
  contextWindowSize?: number
  label: string
  model: string
}

const browserLocalAIModels: BrowserLocalAIModelOption[] = [
  {
    label: 'Qwen3.5 4B (8k context)',
    model: 'Qwen3.5-4B-q4f16_1-MLC',
    contextWindowSize: 8192
  }
]

commandInput.configure({
  initialPlannerOptionId: 'browser-local-ai',
  plannerOptions: [
    {
      id: 'browser-local-ai',
      label: 'Browser local AI',
      modelOptions: browserLocalAIModels,
      createPlanner(options) {
        const modelOption = options?.modelOption as BrowserLocalAIModelOption | undefined

        return createBrowserLocalAIPlanner({
          model: options?.model ?? browserLocalAIModels[0].model,
          contextWindowSize: modelOption?.contextWindowSize
        })
      }
    }
  ],
  settingsOpen: false
})
```

The command input passes the selected `{ model, modelOption }` into `createPlanner()`. Core only requires `label` and `model` on model options, but app-owned arrays can carry extra metadata and recover it with an app-specific type.

For preview or production, pass the selected planner config when the app should own those choices and hide them from users.

The Cloudflare binding default is `@cf/zai-org/glm-4.7-flash` because it returned reliable JSON plans in the demo acceptance checks while keeping the local binding flow fast. The server endpoint first asks for JSON output, then retries without `response_format` when a Workers AI model rejects that option.

## Custom App Planners

Apps can bypass provider configuration and pass a complete planner object to the command input:

```ts
commandInput.configure({
  context: getPlannerContext,
  planner: createBrowserLocalAIPlanner()
})
```

This is the right shape for app-owned experiments such as the demo's browser-local WebLLM planner. The kit receives a `ToolPlanner`; the app owns the model dependency, loading policy, browser requirements, and prompt strategy.

## Tool Sequences

Planner output can be a single invocation:

```json
{
  "toolName": "select_items",
  "input": { "ids": ["item_4"] },
  "confidence": 0.9,
  "reason": "Selected the matching item from the current app context."
}
```

Or a bounded sequence when the user request requires multiple actions:

```json
{
  "toolName": "tool_sequence",
  "input": {},
  "confidence": 0.9,
  "reason": "Select matching invoices, then update their status.",
  "steps": [
    {
      "toolName": "select_invoices",
      "input": { "ids": ["inv_104"] },
      "confidence": 0.9,
      "reason": "Selected the matching Stark Industries invoice."
    },
    {
      "toolName": "update_selected_invoice_status",
      "input": { "status": "paid" },
      "confidence": 0.9,
      "reason": "Marked the selected invoice as paid."
    }
  ]
}
```

Sequence rules:

- Use `toolName: "tool_sequence"` with `input: {}`.
- Include `steps` in dependency order.
- Use at most 5 steps.
- Every step must reference an available registered tool.
- Every step input is validated against that tool's schema before execution.
- Execution stops on the first blocked, failed, or unavailable step.
- Confirmation remains per tool, so mutating steps still require approval.

If the request cannot be executed, planners can return a non-executing outcome:

```json
{
  "toolName": "needs_clarification",
  "input": {},
  "confidence": 0,
  "reason": "Ask which invoice should be marked paid."
}
```

Outcome rules:

- Use `needs_clarification` when the request is plausible but required information is missing from the request and current context.
- Use `no_tools_match` when none of the available tools can satisfy the request.
- Do not include `steps` on planner outcomes.
- `needs_clarification` returns a blocked result from the command input.
- `no_tools_match` returns an unavailable result from the command input.
- `tool_sequence`, `needs_clarification`, and `no_tools_match` are reserved tool names.

The handler shape is:

```ts
interface Env {
  AI: Ai
}

export default {
  async fetch(request: Request, env: Env) {
    const body = (await request.json()) as {
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

WebMCP Kit validates provider output before invocation. Explicitly selected remote providers surface planning errors instead of silently switching to another provider. The automatic planner can use Chrome built-in AI when available and deterministic local planning when browser AI is unavailable or non-strict Chrome planning fails.
