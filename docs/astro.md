# Astro Recipe

Register WebMCP tools inside client-side islands. Server-rendered Astro components do not have access to `window`, `document`, or native browser WebMCP APIs.

```astro
---
import ProductTools from '../components/ProductTools.vue'
---

<ProductTools client:load />
```

For Cloudflare Workers AI planner mode, keep secrets and bindings on the server endpoint. The browser should send the selected provider/model and planning request to your app endpoint, not receive Cloudflare credentials directly.

The demo uses:

- `@astrojs/cloudflare`
- `src/worker.ts`
- `src/pages/api/webmcp/plan.ts`
- `wrangler.toml` with an `AI` binding
