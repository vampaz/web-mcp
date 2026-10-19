# Planner Providers

WebMCP Kit can plan tool calls with different model providers. The app still owns tools, schemas, guards, confirmations, and execution. Providers choose which registered tool to call and which JSON input to pass. For requests that need multiple app actions, providers can return a short ordered `tool_sequence`; for requests that cannot run, they can return `needs_clarification` or `no_tools_match`.

Sequences belong to the command-input contract. The [Pi harness](./pi.md) requests one next action and replans after actual results. Model identifiers below are examples; choose models allowed and tested by your endpoint. They are not a claim of current provider availability or pricing.

## Where Inference Comes From

The kit ships no model service and no default inference endpoint. Your application chooses where inference runs. The command input and Pi use a **planner** (type `ToolPlanner`): a model-provider adapter that receives the available tools and app-owned context, returns the next action, and never executes app tools.

"Planner" is the API name for that adapter, not a user-facing mode. The command input's bounded planning and Pi's conversation loop are two consumers of the same adapter shape; this page documents the adapter, not a mode.

| How the app reaches a model | Configure                                                                              | Secret stays                  | Use when                                                        |
| --------------------------- | -------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------- |
| Browser built-in AI         | `createConfiguredPlanner()` with `provider: 'chrome-built-in'`                         | nowhere                       | Chrome exposes `LanguageModel` and no app-owned model is needed |
| OpenAI-compatible endpoint  | `createRemotePlanner()` with `baseUrl` and `auth`                                      | browser (`user-key`) or proxy | Local or self-hosted model behind a same-origin HTTPS proxy     |
| Your server endpoint        | `createRemotePlanner()` with server-mode `endpoint`                                    | server                        | App-owned provider keys, production, SaaS                       |
| Hosted OpenAI               | `createHostedOpenAIPlanner()` with `accessKey`, `model`, `endpoint`, `sessionEndpoint` | server                        | A separately hosted service supports publishable-key sessions   |
| App-defined adapter         | Implement `ToolPlanner`; declare `capabilities.conversation: true` for Pi              | app-defined                   | WebLLM, custom routing, app-specific inference                  |

Pointing Pi at an app-owned endpoint:

```ts
import { createRemotePlanner } from '@vampaz/webmcp-kit'
import { createPiHarness } from '@vampaz/webmcp-kit/pi'

const planner = createRemotePlanner({
  provider: 'openai',
  model: 'your-approved-model',
  auth: {
    mode: 'server',
    endpoint: '/api/webmcp/plan'
  }
})

const harness = await createPiHarness({
  session: { namespace: 'my-app', ownerId: currentUserId, conversationId: location.pathname },
  worker: { url: '/webmcp-pi/worker.js', scope: '/webmcp-pi/' },
  planner,
  context: getCurrentPageContext
})
```

The `planner` option on `createPiHarness()`, `createPiRuntime()`, and the command input accepts a `ToolPlanner`. `createWebMCPKit({ planner: config })` and the command input's `plannerConfig` option accept a `PlannerProviderConfig` and create the adapter.

`baseUrl` is an OpenAI-compatible base; the kit posts to `baseUrl + '/chat/completions'`. Server mode instead posts the contract below to your route, so the browser never receives provider credentials. A custom conversational adapter must declare `capabilities: { conversation: true }`, honor `PlannerRunOptions.singleStep` and `maxRequestBytes`, and reject failures instead of returning a heuristic fallback.

The remaining sections document each shape in full.

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

### Server request and response contract

`createRemotePlanner()` with `auth.mode: 'server'` sends a JSON POST with the following shape. This interface describes the wire format; it is not an exported kit interface.

```ts
import type { JsonSchema, PlannerContext, PlannerProviderKind } from '@vampaz/webmcp-kit'

interface PlannerEndpointRequest {
  provider: PlannerProviderKind
  model: string
  message: string
  tools: Array<{ name: string; description: string; inputSchema: JsonSchema }>
  context: PlannerContext
  responseSchema: JsonSchema
  singleStep?: true
}
```

The client sends `Content-Type: application/json` and forwards cancellation to `fetch()`. This factory does not add a bearer token or a custom credentials option. Prefer a same-origin endpoint that uses the application's existing session and request protections. A cross-origin deployment must deliberately implement the required CORS and authentication policy.

On success, return a JSON `ToolPlan` directly, not an OpenAI completion envelope or `{ plan: ... }` wrapper. Use a non-2xx status for failure; a JSON `{ "error": "User-safe explanation" }` body supplies an error message. The client validates the plan against the offered tools before execution.

The endpoint must authenticate and authorize the caller, bound and validate the request body, restrict provider/model selection, enforce quotas, and keep provider credentials on the server. Treat schemas, tool descriptions, context, and messages as untrusted input. Tool descriptions are planning data, not instructions to bypass server policy. The endpoint plans; it does not execute application tools.

Use the supplied `responseSchema` as the output contract and validate the model result. For ordinary commands, the contract permits one action, a sequence of 1–5 actions, or a non-executing outcome. With `singleStep: true`, return exactly one action or outcome; `steps` and `tool_sequence` are invalid. Do not infer the result of an action the application has not run.

For Pi, the catalog includes `pi_reply` with a text input schema. It is the runtime's reply operation, not an application mutation. Return it only when it is offered and use actual context/results to compose the answer. `needs_clarification` and `no_tools_match` become assistant text using their `reason` field.

```json
{
  "toolName": "pi_reply",
  "input": { "text": "The counter is now 7." },
  "confidence": 1,
  "reason": "The completed read returned 7."
}
```

Pi supplies fresh application context and a bounded conversation transcript. Preserve that information when building the model prompt. The kit limits the browser's serialized request; the server must separately bound its own added prompt, model context window, response size, and execution time. Do not silently retry with another provider when the selected provider fails.

### Hosted publishable-key mode

`createHostedOpenAIPlanner()` uses a separate session contract. It sends `{ accessKey, model, serviceId: 'hosted-openai-planner', turnstileToken? }` to `sessionEndpoint`, expecting `{ token, tokenType: 'Bearer', expiresAt }`. It then sends the planning body above to `endpoint` with `Authorization: Bearer <token>`. Sessions refresh when fewer than 30 seconds remain; a 403 clears the cached session for a later request, without replaying the failed plan automatically.

By default, `baseUrl` supplies `/api/webmcp/session` and `/api/webmcp/plan`; explicit endpoint options override those paths. `browserChallengeSiteKey`, the `webmcp-turnstile-site-key` meta tag, or an application `window.webmcpCreateTurnstileToken` callback can supply challenge setup. The hosted server must support this protocol and the same single-step contract. A publishable access key is distinct from a provider secret. See the [API reference](./api-reference.md#hostedopenaiplanneroptions) for the factory's exact options.

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
    baseUrl: '/local-model/v1',
    auth: { mode: 'none' }
  }
})
```

The application must implement `/local-model/v1` as a same-origin HTTPS proxy to the intended model service. Open the development domain advertised by the TLS plugin. The browser must not use a separate HTTP model origin. Configure authentication on the proxy when needed and keep shared provider secrets there.

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

Cloudflare binding mode is endpoint-only. The application implements the endpoint with its server-side binding and the request contract above. The kit does not deploy a server, create a binding, or configure credentials. For the separate Astro/Cloudflare demo's setup, follow that [repository's instructions](https://github.com/vampaz/web-mcp-demo). The in-repository Vite lab uses its own local-model proxy and [configuration](../apps/demo/README.md).

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

In local development, omit fixed `provider` and `model` values and pass the endpoint options your app supports if you want the command input to expose planner controls. With only one endpoint option and no additional planner options, the panel stays hidden when Chrome AI is hidden or unavailable. Available Chrome AI adds another choice unless `showChromeAI` is false.

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

The library's configured Cloudflare binding default is `@cf/zai-org/glm-4.7-flash`; the application server must still allow and support that model. Provider-specific output-format support and any retry policy belong to that server. They are not supplied by the kit's endpoint client.

## Custom App Planners

Apps can bypass provider configuration and pass a complete planner object to the command input:

```ts
commandInput.configure({
  context: getPlannerContext,
  planner: createBrowserLocalAIPlanner()
})
```

This is the shape for an app-owned browser-local planner, including a WebLLM integration. The kit receives a `ToolPlanner`; the app owns the model dependency, loading policy, browser requirements, and prompt strategy. The local lab's configured planner uses its LM Studio proxy.

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

Implement the endpoint's authentication, validation, model policy, and response contract described in [server mode](#server-request-and-response-contract). A raw `request.json()` cast followed by an unrestricted model call is not a complete server integration.

## Devtools Selection

If an app does not provide a planner config, development builds can expose a provider selector. That selector should be honest about auth mode:

- Server endpoint: safer for app-owned keys.
- User key in browser: simpler, but visible to the page.

WebMCP Kit validates provider output before invocation. Explicitly selected remote providers surface planning errors instead of silently switching to another provider. The automatic planner can use Chrome built-in AI when available and deterministic local planning when browser AI is unavailable or non-strict Chrome planning fails.
