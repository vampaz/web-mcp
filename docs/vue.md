# Vue Composable

Use `useWebMCPTool` to register a tool for the current Vue effect scope. The tool unregisters automatically when the component unmounts, and `when` can be a ref, computed value, or getter.

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { defineTool } from '@vampaz/webmcp-kit'
import { useWebMCPTool } from '@vampaz/webmcp-kit/vue'

const isSupportRoute = computed(function getIsSupportRoute() {
  return window.location.pathname.startsWith('/support')
})

useWebMCPTool(
  defineTool({
    name: 'create_ticket',
    description: 'Create a support ticket from the current Vue screen.',
    inputSchema: {
      type: 'object',
      properties: {
        subject: { type: 'string' }
      },
      required: ['subject'],
      additionalProperties: false
    },
    execute(input) {
      return {
        subject: input.subject
      }
    }
  }),
  {
    when: isSupportRoute
  }
)
</script>
```

The composable returns the same handle shape as the React and Svelte helpers:

```ts
const supportTool = useWebMCPTool(createTicketTool)

supportTool.getRegistration() // current RegisteredTool or undefined
supportTool.unregister() // unregister before scope disposal when needed
```
