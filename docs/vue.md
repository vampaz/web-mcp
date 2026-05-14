# Vue Recipe

Use the framework-agnostic core API inside Vue lifecycle hooks.

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { defineTool, registerTool, type RegisteredTool } from '@webmcp-kit/core'

let registration: RegisteredTool | undefined

onMounted(function handleMounted() {
  registration = registerTool(defineTool({
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
        subject: String(input.subject ?? '')
      }
    }
  }))
})

onUnmounted(function handleUnmounted() {
  registration?.unregister()
})
</script>
```
