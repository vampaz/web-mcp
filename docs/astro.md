# Astro Recipe

Register WebMCP tools inside client-side islands. Server-rendered Astro components do not have access to `window`, `document`, or native browser WebMCP APIs.

```astro
---
import ProductTools from '../components/ProductTools.vue'
---

<ProductTools client:only="vue" />
```

For Cloudflare Workers AI planner mode, keep secrets and bindings on the server endpoint. The browser should send the selected provider/model and planning request to your app endpoint, not receive Cloudflare credentials directly.

The standalone demo app in [vampaz/web-mcp-demo](https://github.com/vampaz/web-mcp-demo) uses:

- `@astrojs/cloudflare`
- `src/pages/api/webmcp/plan.ts`
- `wrangler.toml` with `main = "@astrojs/cloudflare/entrypoints/server"` and an `AI` binding

For Cloudflare Workers Builds, configure the demo repository as the project root and let Cloudflare CI run the Astro build/deploy flow for that repo.

During integration, call `getIntegrationHealthReport()` from client-side app code or open the devtools overlay to confirm that Astro islands have mounted and registered their WebMCP tools.
