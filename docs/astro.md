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
- `demo/src/pages/api/webmcp/plan.ts`
- `demo/wrangler.toml` with `main = "@astrojs/cloudflare/entrypoints/server"` and an `AI` binding

For Cloudflare Workers Builds, use `npm run build` as the build command and `npm run deploy` as the deploy command.

During integration, call `getIntegrationHealthReport()` from client-side app code or open the devtools overlay to confirm that Astro islands have mounted and registered their WebMCP tools.
