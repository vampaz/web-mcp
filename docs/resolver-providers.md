# Resolver providers

A `ToolResolver` proposes a tool invocation. The core validates and executes it through application approval and guards. A resolver never owns application authorization.

## One factory

```ts
import { createResolver } from '@vampaz/webmcp-kit'

const offline = await createResolver({ provider: 'local' })
const automatic = await createResolver()
const browser = await createResolver({ provider: 'chrome-built-in' })
```

`local` uses deterministic resolution and asks for missing required inputs. It matches the request against tool names, descriptions, property names, and enum values, requires a minimum match before choosing a tool, and fills optional inputs only from evidence in the request (an enum value, a literal boolean, a matching context ID, or a search query). `auto` prefers Chrome AI and permits deterministic fallback. An explicit `chrome-built-in` selection reports provider failure and never switches to heuristics. Chrome requests clone an unprompted base session and destroy each clone, so unrelated requests do not accumulate context. While Chrome downloads its model, `status` is `downloading` and `detail` reports progress; a cancelled request stops waiting while the download continues for other requests. The host disposes the resolver when it is no longer needed.

Built-in remote, server, and hosted resolvers throw `ResolverError` on HTTP failure, with `code` (`context_overflow` or `provider_failed`), `status`, and the provider's message shortened to 300 characters. Custom resolvers can throw `new ResolverError(message, 'context_overflow')` so Pi compacts history instead of failing the turn. A resolution that does not match the offered tools, and model text that is empty or not JSON, throws `ToolResolutionValidationError`; custom resolvers can throw it so Pi retries once with the error.

Remote providers are `openai`, `openrouter`, `openai-compatible`, and `cloudflare-binding`. Choose a model that your endpoint permits; example identifiers are placeholders, not availability claims.

## Production: server mode

```ts
import { createResolver } from '@vampaz/webmcp-kit'

const resolver = await createResolver({
  provider: 'openai',
  model: 'your-approved-model',
  auth: { mode: 'server', endpoint: '/api/webmcp/resolve' }
})
```

The kit supplies no model service or default hosted endpoint. Your server owns authentication, provider secrets, model allowlists, request limits, and billing policy.

### Server request and response contract

The browser POSTs JSON to `auth.endpoint`:

```ts
import type { JsonSchema, ResolverContext, ResolverProviderKind } from '@vampaz/webmcp-kit'

interface ResolverEndpointRequest {
  provider: ResolverProviderKind
  model: string
  message: string
  tools: Array<{
    name: string
    description: string
    inputSchema: JsonSchema
    outputSchema?: JsonSchema
    annotations?: ToolAnnotations
  }>
  context: ResolverContext
  responseSchema: JsonSchema
  singleStep?: true
  purpose?: 'summary'
}
```

This is a wire-format description. The client sends `Content-Type: application/json`, forwards cancellation, and uses normal fetch session behavior. Return a JSON `ToolResolution` directly. A non-2xx response with `{ "error": "Explanation" }` reports failure. Cross-origin endpoints need their own deliberate CORS and authentication configuration.

Validate the request, restrict provider/model selection, and treat tool descriptions and context as untrusted data. For Pi, honor `singleStep: true` and the supplied schema. Return one offered action, `needs_clarification`, `no_tools_match`, or the offered `pi_reply`. Never predict future tool results.

For `purpose: 'summary'`, summarize the supplied history through the offered `pi_reply` tool. Do not select application actions, answer the original request, or offer `needs_clarification` or `no_tools_match`. The supplied response schema excludes these outcomes. Preserve this purpose when forwarding requests to another resolver, and validate the response against the summary contract. Hosted endpoint integrations receive the same field.

## OpenAI-compatible endpoint

```ts
import { createResolver } from '@vampaz/webmcp-kit'

const resolver = await createResolver({
  provider: 'openai-compatible',
  baseUrl: '/model-proxy/v1',
  model: 'your-local-model',
  responseFormat: 'json_schema',
  auth: { mode: 'none' }
})
```

This posts to `baseUrl + '/chat/completions'` and expects an OpenAI-compatible response envelope. A same-origin HTTPS proxy can reach a local model service. Explicit remote failures propagate. Optional `maxTokens`, `temperature`, `reasoningEffort`, and `responseFormat` must match the selected provider's capabilities. `temperature` is sent only when configured, because some reasoning models reject it.

Use `responseFormat: 'text'` when the endpoint's constrained decoder cannot support your tool schemas. This explicitly requests text output containing the same JSON resolution; the kit still validates the JSON, tool name, and complete input schema before returning it. For local models, configure `maxTokens`, `temperature`, and `reasoningEffort` explicitly to keep generation bounded.

User-key mode is `{ mode: 'user-key', apiKey, storageKey? }`. The key is visible to the page. Use server mode for application secrets. Command-input attributes no longer accept credentials.

## Hosted integration

```ts
import { createHostedOpenAIResolver } from '@vampaz/webmcp-kit/hosted'

const resolver = createHostedOpenAIResolver({
  accessKey: appPublishableKey,
  model: 'your-approved-model',
  endpoint: '/api/webmcp/resolve',
  sessionEndpoint: '/api/webmcp/session'
})
```

The application supplies `appPublishableKey` and a compatible session service. This optional integration exchanges a publishable key and optional Turnstile proof for a session token. The provider secret stays on the server. The hosted service used by repository tests is not a default dependency of the kit.

A supplied `expiresAt` controls refresh. Without it, the session stays cached until authentication fails. A 401 or 403 invalidates the token; the failed request is reported and the next request acquires a fresh session. No automatic paid inference retry occurs. Configure Turnstile with `browserChallengeSiteKey`, the `webmcp-turnstile-site-key` meta tag, or `window.webmcpCreateTurnstileToken`.

Concurrent calls through one hosted resolver share a pending challenge and session request. Cancelling one caller stops its wait; the shared request is aborted only when all waiting callers cancel. Session acquisition has a 60-second deadline, and loading the Turnstile script has a 15-second deadline.

## Command input

```ts
import { createResolver } from '@vampaz/webmcp-kit'
import {
  defineWebMCPCommandInput,
  type WebMCPCommandInputElement
} from '@vampaz/webmcp-kit/command-input'

defineWebMCPCommandInput()
const command = document.createElement('webmcp-command-input') as WebMCPCommandInputElement
command.configure({
  resolverOptions: [
    {
      id: 'offline',
      label: 'Offline',
      createResolver() {
        return createResolver({ provider: 'local' })
      }
    },
    {
      id: 'browser',
      label: 'Chrome AI',
      createResolver() {
        return createResolver({ provider: 'chrome-built-in' })
      }
    }
  ],
  context() {
    return { page: 'catalog' }
  }
})
document.body.append(command)
```

Alternatively pass `{ resolver }`. Do not supply both. The first resolver option is the default. Each option can provide `modelOptions: [{ label, model }]`; its factory receives the selected model. `initialResolverOptionId` and `initialModel` set initial selections. Factories own provider configuration; the element owns selection and cancellation. The element disposes factory-created resolvers but borrows a supplied instance.

## Custom app resolvers

Implement `ToolResolver` for another backend. Its `resolve(message, tools, context?, options?)` returns a validated `ToolResolution`. Use `validateToolResolution(resolution, tools, options)` and `normalizeJsonText()` from core when adapting provider responses. Check `options.signal`, enforce `options.maxRequestBytes` on the full serialized request, and honor `options.singleStep` and `options.purpose`. Forward `purpose: 'summary'` to any downstream endpoint and validate its reply against the summary-only contract.

Pi additionally requires `capabilities: { conversation: true }` and an available provider. Custom conversational resolvers must report provider errors without fallback. Pass only necessary visible context; model requests can include inputs, results, and conversation text.

## Tool sequences

The command input accepts up to five ordered `steps` in a `tool_sequence`. Every step runs through core validation, current availability, approval, and guards. A failed step stops the sequence. Pi always chooses one action and resolves again using its actual result. `needs_clarification` and `no_tools_match` produce visible feedback without running a tool.

### Single-step structured responses

With an OpenAI-compatible provider and `responseFormat: 'json_schema'`, a single-step request uses
an `action` envelope. Its schema pairs each tool name with that tool's input schema, preventing
arguments for another tool from satisfying the selected branch. The resolver validates and unwraps
this transport envelope; callers still receive `{ toolName, input, confidence, reason }`.
The prompt still lists each tool's input schema, including property descriptions. Some providers, including LM Studio, apply `response_format` only as an output constraint and never show it to the model, so the prompt is the only place the model can read what each argument means. All JSON examples use the same `action` envelope.
App-owned server resolvers and the command input's bounded sequences retain their existing response contracts.

Provider-side enforcement depends on the selected endpoint and model. The kit sends `json_schema` without `strict: true`; it validates returned actions locally before execution. OpenAI's [strict structured output](https://developers.openai.com/api/docs/guides/structured-outputs) supports a subset of JSON Schema and rejects unsupported strict schemas. [LM Studio](https://lmstudio.ai/docs/developer/openai-compat/structured-output) documents schema-constrained output through this endpoint. Verify support for the actual provider, model, and tool schemas; neither provider enforcement nor valid JSON replaces application validation and approval.

## LM Studio model choices

Use `listLmStudioModels(serverUrl?, signal?)` from `@vampaz/webmcp-kit` to populate shared chat settings. It reads LM Studio’s `/api/v1/models`, excludes non-chat models and sorts loaded instances first. Each option has `model`, `label` and `loaded`; pass its `model` to `createResolver`. It uses the running instance ID when loaded and the model key otherwise. The default server is `http://127.0.0.1:1234`; requests omit application credentials and time out after ten seconds. Discovery errors are reported rather than substituting a model. The host owns selection, CORS and server configuration.
