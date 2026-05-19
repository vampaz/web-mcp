# WebMCP Kit — Monetization Strategies

## 1. Token-Based Pricing (Starting Strategy)

The simplest path to revenue: sell planner tokens. Teams buy tokens, each token funds one planner invocation against the hosted API.

### How It Works

- Teams create an account and buy tokens (e.g. 10K tokens for $X)
- The app server calls `api.webmcpkit.com/plan` with a server-side `wk_live_*` token
- Tokens decrease with each successful plan request; no charge for failed/429/errored responses
- Token balance is visible in a dashboard; low-balance alerts trigger before exhaustion
- When tokens run out, the planner returns a `402` and apps fall back to local/deterministic planning or prompt the user to top up

### Why Tokens First

- Simplest billing model to implement — no subscriptions, no tiers, no feature gating
- Aligns cost with value — teams pay for what they use, free tier lets them evaluate
- Easy to add on top of the existing server-mode auth already in the kit
- No need to build a subscription management system upfront
- Runs on Cloudflare Workers near-zero marginal infra cost per invocation

### Token Pricing Tiers (initial)

| Tokens | Price | Effective per-plan cost |
|---|---|---|
| 1,000 | Free (on signup) | $0 |
| 10,000 | $9 | $0.0009 |
| 100,000 | $49 | $0.00049 |
| 1,000,000 | $199 | $0.000199 |

Exact pricing TBD. The point is a generous free tier for evaluation and graduated volume pricing.

### Technical Integration

The kit already supports browser-to-app server-mode planner auth. WebMCP Cloud should use that path so paid `wk_live_*` tokens stay out of public browser code:

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

Changes needed:

- Add `webmcp-cloud` as a built-in planner provider in `@webmcp-kit/core`
- App-server integration docs for proxying to WebMCP Cloud with `Authorization: Bearer wk_live_*`
- Token-resolved billing middleware on the Workers API with atomic balance debit
- `402` response handling in the kit planner client (fall back to local planner gracefully)
- Dashboard: sign-up, token purchase, usage stats, API key management

### Rate Limiting And Caching

- Per-account rate limiting (e.g. 60 plans/minute) to prevent abuse
- Response caching keyed on account + tool catalog hash + user context hash + prompt + planner/schema version for identical requests within a short TTL
- Cached hits cost 0 tokens — incentivizes same-context reuse during development

## 2. Devtools Pro (Post-Token Launch)

Once token revenue validates demand, layer a paid devtools tier:

- **Team collaboration**: shared tool catalogs, comments, and ownership across org members
- **Persistent replay history**: invocation logs persist across sessions and team members
- **Tool quality scoring**: rate names, descriptions, schemas, guard coverage, and confirmation policy
- **Route coverage maps**: visualize which routes expose tools and where gaps exist
- **Tool diffs**: compare registered tools across deploys or branches
- **Audit export**: generate tool catalogs for security and compliance review

Devtools Pro can be a flat monthly subscription or bundled with a token allowance.

## 3. Enterprise Analytics (Later)

The PRD lists analytics hooks (`F39`) and audit hooks (`S6`) but explicitly defers hosted collection. Once the SDK and planner are stable:

- Tool usage metrics (invocation counts, success/failure rates, latency)
- Confirmation rates and timing
- Planner accuracy and confidence distribution
- Guard block frequency and reasons
- Cross-product aggregation for teams managing WebMCP across multiple apps

The existing V1 privacy requirement (`NF7`) says schemas, inputs, outputs, and API keys are not transmitted to WebMCP Kit services. A hosted planner would deliberately change that contract because planning requires tool schemas, the user command, and app context. Launching this revenue path requires an explicit privacy update: no app secrets, no tool outputs, no raw payload retention by default, and analytics limited to aggregate counts and distributions.

## 4. Consulting and Integration Services

A new browser API creates adoption friction. Short-term revenue:

- Integration workshops for teams adding WebMCP to existing apps
- Migration and tuning support for custom planner configurations
- Custom tool recipe development for specific verticals

Time-limited but high-margin while WebMCP is in Early Preview.

## 5. Recipe Marketplace (When Ecosystem Matures)

The PRD defines Recipes as reusable tool patterns for common flows. A marketplace could be freemium:

- **Community recipes**: free, contributed by the open-source community
- **Verified recipes**: paid, tested and maintained by the WebMCP Kit team, covering common SaaS actions like Stripe charge, HubSpot create-contact, Jira create-ticket

Each recipe package includes the tool definition, schema, guard logic, confirmation policy, and framework-specific helpers.

## Recommended Sequence

| Phase | Action | Product |
|---|---|---|
| Now | Publish free SDK packages, build community | `@webmcp-kit/core` + framework helpers |
| V1 | Launch token-billed hosted planner API | `webmcp-cloud` provider + dashboard |
| Post-revenue | Launch Devtools Pro | Paid devtools tier (flat sub or bundled with tokens) |
| Post-adoption | Enterprise analytics dashboard | Hosted observability |
| Ongoing | Consulting and integration services | Services revenue |
| When ecosystem matures | Recipe marketplace | Verified recipe packs |

The core principle: free SDK drives adoption, tokens monetize the planner immediately, Devtools Pro monetizes the developer experience next.
