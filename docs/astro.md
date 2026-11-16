# Astro Recipe

Register WebMCP tools inside client-side islands. Server-rendered Astro components do not have access to `window`, `document`, or native browser WebMCP APIs.

```astro
---
import ProductTools from '../components/ProductTools.vue'
---

<ProductTools client:only="vue" />
```

For the Cloudflare Workers AI provider, keep secrets and bindings on the server endpoint. The browser should send the selected provider/model and resolution request to your app endpoint, not receive Cloudflare credentials directly.

Your application owns its Astro adapter, resolver endpoint, bindings, and deployment configuration. The kit does not supply those server or deployment resources.

During integration, call `getIntegrationHealthReport()` from client-side app code or open the devtools overlay to confirm that Astro islands have mounted and registered their WebMCP tools.

## Independent conversation UI

Use `mountAssistant()` from `/assistant` for persistent conversations. It creates the shared [Pi controller](./pi.md) and [chat custom element](./chat.md), reports initialization through `ready`, and tears down a controller that finishes after unmount. The application still registers its own tools and owns the resolver. Core framework helpers still own tool registration and cleanup.

`harnessOptions` is application-owned configuration from the Pi setup guide and supplies `session`, `resolver`, and any `context`, `limits`, or `onCancel` callbacks; a custom `host` needs `/pi` with `/chat` instead. Show initialization errors in the host's error UI.

```astro
<app-assistant></app-assistant>
<script>
  import { mountAssistant, type MountedAssistant } from '@vampaz/webmcp-kit/assistant'
  import { harnessOptions } from '../assistant-config'

  class AssistantHost extends HTMLElement {
    private assistant?: MountedAssistant

    connectedCallback() {
      this.replaceChildren()
      const assistant = mountAssistant({ container: this, ...harnessOptions })
      this.assistant = assistant
      void assistant.ready.catch((error) => {
        if (this.assistant === assistant) this.textContent = String(error)
      })
    }

    disconnectedCallback() {
      const assistant = this.assistant
      this.assistant = undefined
      void assistant?.destroy()
    }
  }
  if (!customElements.get('app-assistant')) customElements.define('app-assistant', AssistantHost)
</script>
```

The application-owned host handles ordinary navigation and Astro ClientRouter DOM replacement through custom-element lifecycle callbacks. It also destroys a controller that finishes initializing after the element was removed. Static `mode`, `theme`, `placement`, `heading` and `placeholder` attributes can describe the element before the controller exists; set `chat.controller` or call `configure()` when it is ready, and explicit options win over those defaults.
