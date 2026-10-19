# Astro Recipe

Register WebMCP tools inside client-side islands. Server-rendered Astro components do not have access to `window`, `document`, or native browser WebMCP APIs.

```astro
---
import ProductTools from '../components/ProductTools.vue'
---

<ProductTools client:only="vue" />
```

For the Cloudflare Workers AI provider, keep secrets and bindings on the server endpoint. The browser should send the selected provider/model and planning request to your app endpoint, not receive Cloudflare credentials directly.

The standalone [vampaz/web-mcp-demo](https://github.com/vampaz/web-mcp-demo) owns its Astro adapter, planner endpoint, bindings, and deployment configuration. Follow that repository's current setup when working on the demo. The kit does not supply those server or deployment resources.

During integration, call `getIntegrationHealthReport()` from client-side app code or open the devtools overlay to confirm that Astro islands have mounted and registered their WebMCP tools.

## Independent conversation UI

Use the shared [Pi controller](./pi.md) and [chat custom element](./chat.md) for persistent conversations. Configure model access in application code, mount the element in the browser, and call `harness.destroy()` during teardown. If initialization finishes after unmount, destroy that late controller instead of attaching it. Core framework helpers still own tool registration and cleanup.

`harnessOptions` is application-owned configuration from the Pi setup guide. Show initialization errors in the host's error UI.

```astro
<app-assistant></app-assistant>
<script>
  import { createPiHarness, type PiController } from '@vampaz/webmcp-kit/pi'
  import { defineWebMCPChat, type WebMCPChatElement } from '@vampaz/webmcp-kit/chat'
  import { harnessOptions } from '../assistant-config'

  class AssistantHost extends HTMLElement {
    private harness?: PiController
    private generation = 0

    connectedCallback() {
      const generation = ++this.generation
      defineWebMCPChat()
      this.replaceChildren()
      void createPiHarness(harnessOptions).then(async (harness) => {
        if (!this.isConnected || generation !== this.generation) {
          await harness.destroy()
          return
        }
        this.harness = harness
        const chat = document.createElement('webmcp-chat') as WebMCPChatElement
        chat.configure({ harness })
        this.append(chat)
      }).catch((error) => {
        if (this.isConnected && generation === this.generation) this.textContent = String(error)
      })
    }

    disconnectedCallback() {
      this.generation++
      void this.harness?.destroy()
      this.harness = undefined
    }
  }
  if (!customElements.get('app-assistant')) customElements.define('app-assistant', AssistantHost)
</script>
```

The application-owned host handles ordinary navigation and Astro ClientRouter DOM replacement through custom-element lifecycle callbacks. It also destroys a controller that finishes initializing after the element was removed.
