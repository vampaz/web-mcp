# Resolver providers

A `ToolResolver` proposes a tool invocation. The core validates and executes it through application approval and guards. A resolver never owns application authorization.

## One factory

```ts
import { createResolver } from '@vampaz/webmcp-kit'

const offline = await createResolver({ provider: 'local' })
const automatic = await createResolver()
const browser = await createResolver({ provider: 'chrome-built-in' })
```

`local` uses deterministic resolution and asks for missing required inputs. `auto` prefers Chrome AI and permits deterministic fallback. An explicit `chrome-built-in` selection reports provider failure and never switches to heuristics. Chrome requests clone an unprompted base session and destroy each clone, so unrelated requests do not accumulate context. The host disposes the resolver when it is no longer needed.

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
  tools: Array<{ name: string; description: string; inputSchema: JsonSchema }>
  context: ResolverContext
  responseSchema: JsonSchema
  singleStep?: true
}
```

This is a wire-format description. The client sends `Content-Type: application/json`, forwards cancellation, and uses normal fetch session behavior. Return a JSON `ToolResolution` directly. A non-2xx response with `{ "error": "Explanation" }` reports failure. Cross-origin endpoints need their own deliberate CORS and authentication configuration.

Validate the request, restrict provider/model selection, and treat tool descriptions and context as untrusted data. For Pi, honor `singleStep: true` and the supplied schema. Return one offered action, `needs_clarification`, `no_tools_match`, or the offered `pi_reply`. Never predict future tool results.

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

This posts to `baseUrl + '/chat/completions'` and expects an OpenAI-compatible response envelope. A same-origin HTTPS proxy can reach a local model service. Explicit remote failures propagate. Optional `maxTokens`, `temperature`, `reasoningEffort`, and `responseFormat` must match the selected provider's capabilities.

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

Implement `ToolResolver` for another backend. Its `resolve(message, tools, context?, options?)` returns a validated `ToolResolution`. Use `validateToolResolution()` and `normalizeJsonText()` from core when adapting provider responses. Check `options.signal`, enforce `options.maxRequestBytes` on the full serialized request, and honor `options.singleStep`.

Pi additionally requires `capabilities: { conversation: true }` and an available provider. Custom conversational resolvers must report provider errors without fallback. Pass only necessary visible context; model requests can include inputs, results, and conversation text.

## Tool sequences

The command input accepts up to five ordered `steps` in a `tool_sequence`. Every step runs through core validation, current availability, approval, and guards. A failed step stops the sequence. Pi always chooses one action and resolves again using its actual result. `needs_clarification` and `no_tools_match` produce visible feedback without running a tool.
