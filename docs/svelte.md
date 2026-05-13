# Svelte Recipe

Use the framework-agnostic core API inside `onMount`.

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import { defineTool, registerTool } from '@webmcp-kit/core'

  onMount(function registerTools() {
    const registration = registerTool(defineTool({
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
    }))

    return function unregisterTools() {
      registration.unregister()
    }
  })
</script>
```
