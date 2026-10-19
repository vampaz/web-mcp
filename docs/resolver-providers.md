# Resolver Providers

WebMCP Kit can resolve tool calls with different model providers. The app still owns tools, schemas, guards, confirmations, and execution. Providers choose which registered tool to call and which JSON input to pass. For requests that need multiple app actions, providers can return a short ordered `tool_sequence`; for requests that cannot run, they can return `needs_clarification` or `no_tools_match`.

Sequences belong to the command-input contract. The [Pi harness](./pi.md) requests one next action and re-resolves after actual results. Model identifiers below are examples; choose models allowed and tested by your endpoint. They are not a claim of current provider availability or pricing.

## Where Inference Comes From

The kit ships no model service and no default inference endpoint. Your application chooses where inference runs. The command input and Pi use a **resolver** (type `ToolResolver`): a model-provider adapter that receives the available tools and app-owned context, returns the next action, and never executes app tools.

"Resolver" is the API name for that adapter, not a user-facing mode. The command input's bounded resolution and Pi's conversation loop are two consumers of the same adapter shape; this page documents the adapter, not a mode.

| How the app reaches a model | Configure                                                                               | Secret stays                  | Use when                                                        |
| --------------------------- | --------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------- |
| Browser built-in AI         | `createConfiguredResolver()` with `provider: 'chrome-built-in'`                         | nowhere                       | Chrome exposes `LanguageModel` and no app-owned model is needed |
| OpenAI-compatible endpoint  | `createRemoteResolver()` with `baseUrl` and `auth`                                      | browser (`user-key`) or proxy | Local or self-hosted model behind a same-origin HTTPS proxy     |
| Your server endpoint        | `createRemoteResolver()` with server-mode `endpoint`                                    | server                        | App-owned provider keys, production, SaaS                       |
| Hosted OpenAI               | `createHostedOpenAIResolver()` with `accessKey`, `model`, `endpoint`, `sessionEndpoint` | server                        | A separately hosted service supports publishable-key sessions   |
| App-defined adapter         | Implement `ToolResolver`; declare `capabilities.conversation: true` for Pi              | app-defined                   | WebLLM, custom routing, app-specific inference                  |

Pointing Pi at an app-owned endpoint:

```ts
import { createRemoteResolver } from '@vampaz/webmcp-kit'
import { createPiHarness } from '@vampaz/webmcp-kit/pi'

const resolver = createRemoteResolver({
  provider: 'openai',
  model: 'your-approved-model',
  auth: {
    mode: 'server',
    endpoint: '/api/webmcp/resolve'
  }
})

const harness = await createPiHarness({
  session: { namespace: 'my-app', ownerId: currentUserId, conversationId: location.pathname },
  worker: { url: '/webmcp-pi/worker.js', scope: '/webmcp-pi/' },
  resolver,
  context: getCurrentPageContext
})
```

The `resolver` option on `createPiHarness()`, `createPiRuntime()`, and the command input accepts a `ToolResolver`. `createWebMCPKit({ resolver: config })` and the command input's `resolverConfig` option accept a `ResolverProviderConfig` and create the adapter.

`baseUrl` is an OpenAI-compatible base; the kit posts to `baseUrl + '/chat/completions'`. Server mode instead posts the contract below to your route, so the browser never receives provider credentials. A custom conversational adapter must declare `capabilities: { conversation: true }`, honor `ResolverRunOptions.singleStep` and `maxRequestBytes`, and reject failures instead of returning a heuristic fallback.

The remaining sections document each shape in full.

## Production: Server Mode

Use server mode when the key belongs to the app or company.

```ts
import { createWebMCPKit } from '@vampaz/webmcp-kit'

const kit = await createWebMCPKit({
  resolver: {
    provider: 'openrouter',
    model: 'nvidia/nemotron-3-super-120b-a12b:free',
    auth: {
      mode: 'server',
      endpoint: '/api/webmcp/resolve'
    }
  }
})
```

The browser sends the resolution request to `endpoint`. The server or Worker stores the provider secret and calls OpenRouter, OpenAI, Cloudflare Workers AI, or another provider. This is the right mode for public apps and SaaS products.

### Server request and response contract

`createRemoteResolver()` with `auth.mode: 'server'` sends a JSON POST with the following shape. This interface describes the wire format; it is not an exported kit interface.

```ts
import type { JsonSchema, ResolverContext, ResolverProviderKind } from '@vampaz/webmcp-kit'

interface ResolverEndpointRequest {
  provider: ResolverProviderKind
  model: string
  message: string
  tools: Array<{ name: string; description: string; inputSchema: JsonSchema }>
  context: ResolverContext
  responseSchema: JsonSchema
  singleStep?: true
}
```

The client sends `Content-Type: application/json` and forwards cancellation to `fetch()`. This factory does not add a bearer token or a custom credentials option. Prefer a same-origin endpoint that uses the application's existing session and request protections. A cross-origin deployment must deliberately implement the required CORS and authentication policy.

On success, return a JSON `ToolResolution` directly, not an OpenAI completion envelope or `{ resolution: ... }` wrapper. Use a non-2xx status for failure; a JSON `{ "error": "User-safe explanation" }` body supplies an error message. The client validates the resolution against the offered tools before execution.

The endpoint must authenticate and authorize the caller, bound and validate the request body, restrict provider/model selection, enforce quotas, and keep provider credentials on the server. Treat schemas, tool descriptions, context, and messages as untrusted input. Tool descriptions are resolution data, not instructions to bypass server policy. The endpoint resolves; it does not execute application tools.

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

`createHostedOpenAIResolver()` uses a separate session contract. It sends `{ accessKey, model, serviceId: 'hosted-openai-resolver', turnstileToken? }` to `sessionEndpoint`, expecting `{ token, tokenType: 'Bearer', expiresAt }`. It then sends the resolution body above to `endpoint` with `Authorization: Bearer <token>`. Sessions refresh when fewer than 30 seconds remain; a 403 clears the cached session for a later request, without replaying the failed resolution automatically.

By default, `baseUrl` supplies `/api/webmcp/session` and `/api/webmcp/resolve`; explicit endpoint options override those paths. `browserChallengeSiteKey`, the `webmcp-turnstile-site-key` meta tag, or an application `window.webmcpCreateTurnstileToken` callback can supply challenge setup. The hosted server must support this protocol and the same single-step contract. A publishable access key is distinct from a provider secret. See the [API reference](./api-reference.md#hostedopenairesolveroptions) for the factory's exact options.

## Simple Experiments: User-Key Mode

Use user-key mode when the key belongs to the person using the browser, or for local experiments.

```ts
const kit = await createWebMCPKit({
  resolver: {
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
  resolver: {
    provider: 'chrome-built-in',
    auth: { mode: 'none' }
  }
})
```

OpenAI:

```ts
await createWebMCPKit({
  resolver: {
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
  resolver: {
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
  resolver: {
    provider: 'cloudflare-binding',
    model: '@cf/zai-org/glm-4.7-flash',
    auth: {
      mode: 'server',
      endpoint: '/api/webmcp/resolve'
    }
  }
})
```

Cloudflare binding mode is endpoint-only. The application implements the endpoint with its server-side binding and the request contract above. The kit does not deploy a server, create a binding, or configure credentials. For the separate Astro/Cloudflare demo's setup, follow that [repository's instructions](https://github.com/vampaz/web-mcp-demo). The in-repository Vite lab uses its own local-model proxy and [configuration](../apps/demo/README.md).

When a provider is explicitly selected, WebMCP Kit uses that provider. It does not silently switch the command to deterministic local resolution.

Pass the selected resolver to `getIntegrationHealthReport({ resolver })` during development to expose provider readiness in the same diagnostics used by the devtools overlay.

## Web Component Input

`@vampaz/webmcp-kit` also exports a ready-made web component for apps that want a command input without building their own resolver UI:

```ts
import { defineWebMCPCommandInput } from '@vampaz/webmcp-kit'

defineWebMCPCommandInput()
```

```html
<webmcp-command-input
  provider="cloudflare-binding"
  model="@cf/zai-org/glm-4.7-flash"
  endpoint="/api/webmcp/resolve"
></webmcp-command-input>
```

Provider and model controls are only shown when the app has not fixed those values through attributes, properties, `configure()`, or a supplied `resolverConfig`, and when the available resolver options contain a real choice.

Chrome built-in AI is not a server endpoint. The command input detects the browser `LanguageModel` API and adds the Chrome built-in AI provider automatically when it is available. Apps can hide that local provider:

```ts
commandInput.configure({
  showChromeAI: false
})
```

In local development, omit fixed `provider` and `model` values and pass the endpoint options your app supports if you want the command input to expose resolver controls. With only one endpoint option and no additional resolver options, the panel stays hidden when Chrome AI is hidden or unavailable. Available Chrome AI adds another choice unless `showChromeAI` is false.

```ts
commandInput.configure({
  context: getResolverContext,
  endpoint: '/api/webmcp/resolve',
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

`endpointOptions` lets the app provide the concrete resolver endpoints it has tested and allows through its server route. Provider-only options such as `auto` and `local` can omit `model`. The command input only renders those choices; it does not own the demo's OpenRouter, OpenAI, Cloudflare, or app-specific resolver curation.

Use `resolverOptions` for app-owned resolvers such as a WebLLM browser-local resolver or a demo-specific deterministic resolver. `initialResolverOptionId` and `initialModel` set default selections without fixing the provider for the user. `settingsOpen` controls the options disclosure when the command input renders.

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
  initialResolverOptionId: 'browser-local-ai',
  resolverOptions: [
    {
      id: 'browser-local-ai',
      label: 'Browser local AI',
      modelOptions: browserLocalAIModels,
      createResolver(options) {
        const modelOption = options?.modelOption as BrowserLocalAIModelOption | undefined

        return createBrowserLocalAIResolver({
          model: options?.model ?? browserLocalAIModels[0].model,
          contextWindowSize: modelOption?.contextWindowSize
        })
      }
    }
  ],
  settingsOpen: false
})
```

The command input passes the selected `{ model, modelOption }` into `createResolver()`. Core only requires `label` and `model` on model options, but app-owned arrays can carry extra metadata and recover it with an app-specific type.

For preview or production, pass the selected resolver config when the app should own those choices and hide them from users.

The library's configured Cloudflare binding default is `@cf/zai-org/glm-4.7-flash`; the application server must still allow and support that model. Provider-specific output-format support and any retry policy belong to that server. They are not supplied by the kit's endpoint client.

## Custom App Resolvers

Apps can bypass provider configuration and pass a complete resolver object to the command input:

```ts
commandInput.configure({
  context: getResolverContext,
  resolver: createBrowserLocalAIResolver()
})
```

This is the shape for an app-owned browser-local resolver, including a WebLLM integration. The kit receives a `ToolResolver`; the app owns the model dependency, loading policy, browser requirements, and prompt strategy. The local lab's configured resolver uses its LM Studio proxy.

## Tool Sequences

Resolver output can be a single invocation:

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

If the request cannot be executed, resolvers can return a non-executing outcome:

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
- Do not include `steps` on resolver outcomes.
- `needs_clarification` returns a blocked result from the command input.
- `no_tools_match` returns an unavailable result from the command input.
- `tool_sequence`, `needs_clarification`, and `no_tools_match` are reserved tool names.

Implement the endpoint's authentication, validation, model policy, and response contract described in [server mode](#server-request-and-response-contract). A raw `request.json()` cast followed by an unrestricted model call is not a complete server integration.

## Devtools Selection

If an app does not provide a resolver config, development builds can expose a provider selector. That selector should be honest about auth mode:

- Server endpoint: safer for app-owned keys.
- User key in browser: simpler, but visible to the page.

WebMCP Kit validates provider output before invocation. Explicitly selected remote providers surface resolution errors instead of silently switching to another provider. The automatic resolver can use Chrome built-in AI when available and deterministic local resolution when browser AI is unavailable or non-strict Chrome resolution fails.
