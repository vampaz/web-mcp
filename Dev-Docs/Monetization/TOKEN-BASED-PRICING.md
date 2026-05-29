# Token-Based Pricing — Detailed Plan

## Overview

WebMCP Kit sells planner tokens. Each token entitles the holder to one planner invocation against the hosted API at `api.webmcpkit.com/plan`. This is the first revenue channel because it aligns cost with usage and leverages the existing browser-to-app server-mode planner auth pattern.

## Why Tokens First

- The kit already has server-mode planner auth (`auth: { mode: 'server', endpoint }`). Adding `webmcp-cloud` as a built-in provider requires a new provider kind, app-server proxy guidance, and a token-resolved API endpoint.
- No subscription management, no feature gating, no Stripe integration beyond token purchases.
- Cloudflare Workers gives near-zero marginal cost per invocation. Token pricing can sustain a generous free tier.
- Teams entering WebMCP adoption need a working planner to experience value. Tokens make that immediate.
- Token exhaustion is a natural upgrade signal — teams that run out are the ones getting value.

## Architecture

### Current Flow

```
Browser → App server endpoint → Provider API (OpenAI / OpenRouter / CF Workers AI)
```

The app owns the endpoint, manages secrets, and routes to the chosen provider.

### Token Flow

```
Browser → App server endpoint → api.webmcpkit.com/plan → Cloudflare Worker → Provider API
                                                                  ↓
                                                            Token ledger (D1)
```

The app server owns the paid `wk_live_*` token and calls WebMCP Kit Cloud. WebMCP Kit Cloud manages model routing and debits tokens per successful invocation. A future direct-browser mode would need publishable, origin-bound, spend-limited client tokens; raw `wk_live_*` tokens must never be embedded in browser code.

### Kit Integration

The client-side change is a new `PlannerProviderKind` value. The browser points at the app-owned server endpoint, not directly at WebMCP Cloud with a paid account token:

```ts
await createWebMCPKit({
  planner: {
    provider: 'webmcp-cloud',
    model: 'auto',
    auth: {
      mode: 'server',
      endpoint: '/api/webmcp/plan'
    }
  }
})
```

The `<webmcp-command-input>` web component should support the same app-server endpoint once `webmcp-cloud` is added to its provider parser and options:

```html
<webmcp-command-input
  provider="webmcp-cloud"
  model="auto"
  endpoint="/api/webmcp/plan"
></webmcp-command-input>
```

Fallback behavior: when tokens are exhausted, the API returns `402 Payment Required`. The kit planner client catches `402` and falls back to the local heuristic planner, so the app never breaks — it just loses AI planning until tokens are replenished.

## Token Mechanics

### Unit of Account

One token = one successful planner invocation. A planner invocation is a single `POST /plan` request that returns a valid `ToolPlan` (single tool or `tool_sequence` with up to 5 steps).

The following do NOT consume a token:

| Response                | Reason                                           |
| ----------------------- | ------------------------------------------------ |
| `402 Payment Required`  | Tokens exhausted; no plan produced               |
| `429 Too Many Requests` | Rate limited; retryable                          |
| `5xx` server errors     | Infrastructure failure; not the customer's fault |
| `400 Bad Request`       | Malformed request; rejected before planning      |
| Cached responses        | Account-scoped identical requests within TTL     |

Only `200` with a valid plan debits a token. This keeps the contract simple and fair.

### Ledger Consistency

Token debit must be atomic with usage logging. The API should validate the request, generate or accept an idempotency key, then reserve one token in a D1 transaction or account-scoped Durable Object operation before calling the model. If planning succeeds with a valid plan, the API finalizes the debit and writes the usage row. If planning fails, the API releases the reservation. If the balance is zero, the API returns `402` before calling the model.

This prevents parallel requests from overdrawing an account and prevents client retries from double-charging the same successful plan.

### Token Purchase

Tokens are bought in packs. Each account starts with a free allocation.

| Pack    | Tokens    | Price | Effective per-plan | Free allocation |
| ------- | --------- | ----- | ------------------ | --------------- |
| Starter | 1,000     | Free  | $0                 | Yes (on signup) |
| Small   | 10,000    | $9    | $0.0009            | No              |
| Medium  | 100,000   | $49   | $0.00049           | No              |
| Large   | 1,000,000 | $199  | $0.000199          | No              |

Exact pricing is TBD. The point is a generous free tier for evaluation and volume pricing that decreases per-plan cost.

### Token Expiry

Tokens do not expire. A team that buys 100K tokens can use them over any period. This avoids urgency pressure and aligns with project-based WebMCP adoption timelines.

### Token Sharing

An API token (`wk_live_*` or `wk_test_*`) represents one account. All tokens in that account draw from the same balance. Teams share a single balance through one account; larger organizations can create multiple accounts for billing separation. These are secret server-side tokens, not browser publishable tokens.

## API Design

### Endpoint

```
POST https://api.webmcpkit.com/plan
```

### Request

```json
{
  "provider": "webmcp-cloud",
  "model": "auto",
  "message": "Create an invoice for Acme for 250 euros",
  "tools": [
    {
      "name": "create_invoice",
      "description": "Create an invoice for a customer.",
      "inputSchema": {
        "type": "object",
        "properties": { "customerName": { "type": "string" }, "amount": { "type": "number" } },
        "required": ["customerName", "amount"]
      }
    }
  ],
  "context": { "route": "/invoices", "selectedIds": [] },
  "responseSchema": {
    "type": "object",
    "properties": {
      "toolName": { "type": "string" },
      "input": { "type": "object" },
      "confidence": { "type": "number" },
      "reason": { "type": "string" },
      "steps": { "type": "array" }
    },
    "required": ["toolName", "input", "confidence", "reason"]
  }
}
```

The request body matches the existing server-mode planner contract and is sent by the app server to WebMCP Kit Cloud. The `provider` field tells the API which underlying model to use. The `webmcp-cloud` provider treats `model: 'auto'` as model selection by the API.

### Auth

Trusted app servers authenticate via an `Authorization` header:

```
Authorization: Bearer wk_live_abc123
```

The browser planner client must not send this token. If a future core API adds token-bearing server auth, it should be documented for trusted server runtimes only. For browser integrations, the app server reads `WEBMCP_CLOUD_TOKEN` from its environment and attaches the `Authorization` header when proxying to `api.webmcpkit.com`.

### Privacy Boundary

The hosted planner receives tool schemas, the user command, and app context because those are required to produce a plan. This is a deliberate change from the V1 `NF7` requirement, which says schemas, inputs, outputs, and API keys are not transmitted to WebMCP Kit services.

Launch requires an explicit privacy contract update:

1. Never send app secrets or hidden server values.
2. Do not send tool outputs.
3. Do not retain raw schemas, commands, or context by default.
4. Store only aggregate usage metadata unless the account explicitly enables diagnostic retention.
5. Keep `wk_live_*` tokens server-side and store only token hashes.

### Response (success)

```json
{
  "toolName": "create_invoice",
  "input": { "customerName": "Acme Corp", "amount": 250 },
  "confidence": 0.92,
  "reason": "Created an invoice for Acme Corp for the requested amount."
}
```

One token is debited.

### Response (insufficient tokens)

```
HTTP 402 Payment Required
```

```json
{
  "error": "insufficient_tokens",
  "detail": "This account has 0 tokens remaining. Visit https://webmcpkit.com/dashboard to purchase more.",
  "fallback": "local"
}
```

The kit planner client catches `402` and falls back to the local heuristic planner. No error is thrown to the app; the planner status changes to indicate fallback mode.

### Response (rate limited)

```
HTTP 429 Too Many Requests
```

```json
{
  "error": "rate_limited",
  "detail": "Rate limit exceeded. Retry after 2 seconds.",
  "retryAfter": 2
}
```

The API includes `Retry-After`. The initial kit client can surface the existing planner error/fallback path; automatic retry with exponential backoff is a separate client enhancement if we decide it is worth the added latency.

### Response (invalid request)

```
HTTP 400 Bad Request
```

No token is debited.

## Model Routing

The `model` field in the request controls which underlying model the API uses:

| `model` value | Behavior                                                                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto`        | The API selects the best available model for tool planning. Starts with a fast, cheap model; escalates to a more capable model if the first attempt returns invalid JSON or an unknown tool. |
| `fast`        | Uses the fastest available model (lowest latency, lowest cost per token).                                                                                                                    |
| `capable`     | Uses the most capable available model (highest planning accuracy).                                                                                                                           |

This keeps the API simple while allowing the backend to swap providers without client changes.

### Provider Candidates

The Cloudflare Worker backend routes to:

1. **Cloudflare Workers AI** (`@cf/moonshotai/kimi-k2.6`, `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`) — cheapest per invocation, runs on the same Cloudflare infrastructure.
2. **OpenRouter** (`openrouter/auto`) — fallback for models not available on Workers AI.
3. **OpenAI** (`gpt-4.1-mini`) — premium option when accuracy matters more than cost.

The API hides provider selection from the client. `auto` starts with Workers AI and escalates only on failure.

## Caching

### Strategy

Cache responses keyed on a hash of:

1. **Account ID**: prevents cross-tenant cache hits
2. **Tool catalog hash**: sorted list of `{ name, description, inputSchema }` for all registered tools
3. **Context hash**: `JSON.stringify(context)` sorted by key
4. **Prompt**: the normalized user message
5. **Model**: the resolved backend model identifier
6. **Planner prompt version**: invalidates cache when system prompts change
7. **Response schema version**: invalidates cache when `ToolPlan` changes

TTL: 5 minutes for identical context. This covers common development patterns where a user repeats the same command during testing.

### Cache Hits

Cached responses return `200` with an `X-WebMCP-Cache: hit` header. Cache hits do **not** debit a token. This incentivizes same-context reuse during development without penalizing teams for repeated testing.

### Cache Invalidation

Context changes invalidate the cache — if the selected rows, route, or app state changes, the cache key changes and a fresh plan is generated. Planner prompt, response schema, and resolved model changes also invalidate the cache so stale plans do not survive backend upgrades.

## Rate Limiting

| Tier             | Requests per minute | Burst |
| ---------------- | ------------------- | ----- |
| Free (1K tokens) | 10                  | 20    |
| Paid             | 60                  | 120   |

Rate limits are per-account, identified by the API token. The `429` response includes a `Retry-After` header. Automatic client retry is not required for the initial launch unless it is added to the client implementation and covered by tests.

Rate limiting uses Cloudflare Rate Limiting rules on the Worker route, with a KV-backed counter for per-account tracking.

## Client-Side Changes in `webmcp-kit`

### New Provider Kind

Add `webmcp-cloud` to `PlannerProviderKind`:

```ts
export type PlannerProviderKind =
  | 'auto'
  | 'chrome-built-in'
  | 'local'
  | 'openai'
  | 'openrouter'
  | 'openai-compatible'
  | 'cloudflare-binding'
  | 'webmcp-cloud'
```

### Planner Auth Extension

The existing `PlannerAuth` supports `{ mode: 'server', endpoint: string }`, which is enough for browser-to-app server calls. For `webmcp-cloud`, production apps should proxy through their own endpoint and keep `wk_live_*` in server environment variables.

Do not add a browser-facing `token` attribute or request-body token for paid `wk_live_*` keys. If direct-browser billing is needed later, design a separate publishable token type with origin restrictions, spend limits, and revocation.

Client-side changes:

1. Add `webmcp-cloud` to `PlannerProviderKind`.
2. Add `webmcp-cloud` to `<webmcp-command-input>` provider validation/options.
3. When the planner client receives a `402` response from a `webmcp-cloud` endpoint, fall back to the local heuristic planner and emit an event or status change so the app can surface a "tokens low" notice.

### Fallback on 402

```ts
if (response.status === 402) {
  const fallbackPlanner = createHeuristicPlanner()
  const fallbackPlan = await fallbackPlanner.plan(message, tools, context)

  return {
    ...fallbackPlan,
    reason: 'WebMCP Cloud tokens exhausted. Using local planner fallback.',
    _fallbackReason: 'insufficient_tokens'
  }
}
```

This preserves the existing graceful degradation pattern — the app works, just with heuristic planning.

### Token Balance Check

Optionally, the kit can expose a server-side `getTokenBalance()` helper that calls `GET https://api.webmcpkit.com/balance` with the account token. Browser UIs should call their own app endpoint for balance display.

```ts
import { getTokenBalance } from 'webmcp-kit'

const balance = await getTokenBalance('wk_live_abc123')
// { tokens: 8432, plan: 'starter', nextReset: null }
```

## Dashboard

A simple dashboard at `webmcpkit.com/dashboard` provides:

1. **Sign-up / sign-in**: email + password or GitHub OAuth.
2. **API token management**: create, revoke, and rotate `wk_live_*` and `wk_test_*` tokens.
3. **Token balance**: current token count and usage history.
4. **Purchase tokens**: Stripe checkout for token packs.
5. **Usage logs**: timestamp, model, tool count, cache status, and latency for each invocation. Raw schemas, commands, context, inputs, and outputs are not retained by default.
6. **Low-balance alerts**: email notification when tokens drop below 10% of the last purchase.

### Tech Stack

- Cloudflare Pages (dashboard SPA)
- Cloudflare Workers (API)
- Cloudflare D1 (account data, token ledger, usage logs)
- Cloudflare KV (request cache, rate limiting counters)
- Stripe (token pack purchases via Checkout)

## Billing Flow

```
Sign up → Get 1,000 free tokens → Integrate kit → Use planner → Tokens decrease
→ Below threshold → Email alert → Purchase pack → Tokens replenish
```

Steps:

1. Team creates an account and gets 1,000 free tokens and a `wk_live_*` API token.
2. Team stores the `wk_live_*` token on its server and configures the browser integration to call its app endpoint.
3. The app endpoint proxies planning requests to WebMCP Kit Cloud. Each successful `/plan` call debits one token. Cached responses are free.
4. When balance drops below 10% of last purchase, the dashboard sends an email alert.
5. When tokens reach zero, `/plan` returns `402` and the kit falls back to local planning.
6. Team purchases a token pack through Stripe Checkout in the dashboard.
7. Tokens are added immediately; no manual code deployment needed.

## Security

- API tokens (`wk_live_*`, `wk_test_*`) are generated server-side and stored hashed in D1. The raw token is shown once at creation time and must be used only from trusted server environments.
- `wk_test_*` tokens never debit real tokens — they return deterministic mock plans for testing. This lets teams test their integration end-to-end without spending tokens.
- All API traffic is HTTPS. The planner endpoint never receives app secrets, but it does receive tool schemas, the user message, and app context. This requires updating the existing privacy requirement (`NF7`) before launch.
- The dashboard uses session-based auth (httpOnly cookies) for the management UI. API tokens are separate from dashboard sessions.
- Rate limiting prevents brute-force token guessing and usage spikes.

## Costs

### Variable Costs per 1,000 Invocations

| Provider              | Approx. cost per 1K plans | Notes                             |
| --------------------- | ------------------------- | --------------------------------- |
| Cloudflare Workers AI | $0.00                     | Free tier covers most early usage |
| OpenRouter (auto)     | $0.10–$0.50               | Depends on model selected         |
| OpenAI (gpt-4.1-mini) | $0.15–$0.60               | More capable, higher cost         |

At the Medium pack price ($49 for 100K tokens), variable cost is approximately $5-$60 depending on model mix, leaving $44 to -$11 gross margin. The launch model must keep most `auto` traffic on low-cost Workers AI models or raise prices before routing substantial traffic to premium providers.

### Fixed Costs

| Item               | Cost                                                              |
| ------------------ | ----------------------------------------------------------------- |
| Cloudflare Workers | Free tier for first 100K requests/day                             |
| Cloudflare D1      | Free tier covers early usage                                      |
| Cloudflare KV      | Free tier covers caching and rate limiting                        |
| Domain + SSL       | ~$15/year                                                         |
| Stripe integration | 2.9% + $0.30 per transaction (minimally impacting at pack prices) |

Initial infrastructure cost is near zero. Costs scale linearly with usage, and token pricing is layered to maintain margin at every tier.

## Launch Sequence

| Step | Deliverable                                                                                               | Dependencies                     |
| ---- | --------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 1    | Add `webmcp-cloud` provider kind, command-input support, and `402` fallback to `webmcp-kit`               | None                             |
| 2    | Build `api.webmcpkit.com/plan` Worker with atomic token ledger, model routing, and account-scoped caching | D1 schema, KV namespace          |
| 3    | Build dashboard (sign-up, tokens, usage, purchase)                                                        | Stripe account, Cloudflare Pages |
| 4    | Add `getTokenBalance()` to core                                                                           | API Worker running               |
| 5    | Update planner-providers docs with `webmcp-cloud` usage                                                   | Steps 1–4 complete               |
| 6    | Publish npm packages with `webmcp-cloud` support                                                          | Steps 1–4 complete               |
| 7    | Launch landing page with pricing, docs, and signup CTA                                                    | Steps 2–3 complete               |

Steps 1 and 2 can start immediately. Step 3 is the largest effort. Step 5 and 6 depend on the API being live. Step 7 is marketing, not engineering.

## Open Decisions

1. **Token vs. credit naming**: "tokens" is clear but "credits" might feel more familiar. Low priority; can rename later.
2. **Free tier size**: 1,000 free tokens may be too few for a team evaluating the kit during a multi-week trial. Consider 5,000.
3. **Auto-recharge**: Should accounts auto-recharge when tokens drop below a threshold? Adds Stripe complexity but reduces friction. Defer to post-launch.
4. **Team accounts**: Initial launch can be single-user accounts. Team management (multiple API tokens per org, shared balance, role-based access) is a post-launch feature.
5. **Model-specific pricing**: Should `model: 'capable'` cost more tokens than `model: 'auto'`? Simplest to start with 1 token = 1 plan regardless of model.
6. **Audit logging**: The dashboard shows usage stats. Should it also expose an audit log export for enterprise compliance? Defer to Devtools Pro phase.
7. **Direct browser billing**: Should WebMCP Cloud ever support publishable browser tokens? Defer until there is a concrete origin-bound, spend-limited design.
