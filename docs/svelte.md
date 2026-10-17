# Svelte Helper

Use `useWebMCPTool` to register a tool while the component is mounted. `when` can be a boolean, function, or readable store.

```svelte
<script lang="ts">
  import type { Readable } from 'svelte/store'
  import { defineTool } from '@vampaz/webmcp-kit'
  import { useWebMCPTool } from '@vampaz/webmcp-kit/svelte'

  const { isCatalogRoute } = $props<{ isCatalogRoute: Readable<boolean> }>()

  useWebMCPTool(defineTool({
    name: 'search_products',
    description: 'Search the local product catalog for the current shopper.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' }
      },
      required: ['query'],
      additionalProperties: false
    },
    execute(input) {
      return input
    }
  }), {
    when: isCatalogRoute
  })
</script>
```

The parent supplies a stable readable store that emits route availability changes. A store constructed from `window.location` once would neither track navigation nor work during server rendering. Replace the sample's echoed input with the application's search function.

The helper returns the same handle shape as the Vue and React helpers:

```ts
const searchTool = useWebMCPTool(searchProductsTool)

searchTool.getRegistration() // current RegisteredTool or undefined (set after mount)
searchTool.unregister() // unregister before destroy when needed
```

## Independent conversation UI

Use the shared [Pi controller](./pi.md) and [chat custom element](./chat.md) for persistent conversations. Configure model access in application code, mount the element in the browser, and call `harness.destroy()` during teardown. If initialization finishes after unmount, destroy that late controller instead of attaching it. Core framework helpers still own tool registration and cleanup.

`harnessOptions` is application-owned configuration from the Pi setup guide. Show initialization errors in the host's error UI.

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import { createPiHarness, type PiController } from '@vampaz/webmcp-kit/pi'
  import { defineWebMCPChat, type WebMCPChatElement } from '@vampaz/webmcp-kit/chat'
  import { harnessOptions } from './assistant-config'

  let container: HTMLDivElement
  let error = $state('')
  onMount(function mount() {
    let closed = false
    let harness: PiController | undefined
    defineWebMCPChat()
    void createPiHarness(harnessOptions).then(async function connected(next) {
      if (closed) { await next.destroy(); return }
      harness = next
      const chat = document.createElement('webmcp-chat') as WebMCPChatElement
      chat.configure({ harness })
      container.append(chat)
    }).catch(function failed(cause) {
      if (!closed) error = cause instanceof Error ? cause.message : 'The assistant could not start.'
    })
    return function cleanup() { closed = true; void harness?.destroy() }
  })
</script>

{#if error}<p role="alert">{error}</p>{/if}
<div bind:this={container}></div>
```
