# Vue Composable

Use `useWebMCPTool` to register a tool for the current Vue effect scope. The tool unregisters automatically when the component unmounts, and `when` can be a ref, computed value, or getter.

```vue
<script setup lang="ts">
import { defineTool } from '@vampaz/webmcp-kit'
import { useWebMCPTool } from '@vampaz/webmcp-kit/vue'

const props = defineProps<{ isSupportRoute: boolean }>()

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
    confirmation: { required: true, reason: 'Create this support ticket?' },
    execute(input) {
      return createSupportTicket(input.subject)
    }
  }),
  {
    when: function available() {
      return props.isSupportRoute
    }
  }
)
</script>
```

The parent supplies a reactive `isSupportRoute` value from its router. `createSupportTicket()` is the application's action, and the application supplies its approval handler. Reading `window.location` inside a computed value would not track client-side route changes.

The composable returns the same handle shape as the React and Svelte helpers:

```ts
const supportTool = useWebMCPTool(createTicketTool)

supportTool.getRegistration() // current RegisteredTool or undefined
supportTool.unregister() // unregister before scope disposal when needed
```

## Independent conversation UI

Use the shared [Pi controller](./pi.md) and [chat custom element](./chat.md) for persistent conversations. Configure model access in application code, mount the element in the browser, and call `harness.destroy()` during teardown. If initialization finishes after unmount, destroy that late controller instead of attaching it. Core framework helpers still own tool registration and cleanup.

`harnessOptions` is application-owned configuration from the Pi setup guide. Show initialization errors in the host's error UI.

```vue
<template>
  <p v-if="error" role="alert">{{ error }}</p>
  <div ref="container" />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { createPiHarness, type PiController } from '@vampaz/webmcp-kit/pi'
import { defineWebMCPChat, type WebMCPChatElement } from '@vampaz/webmcp-kit/chat'
import { harnessOptions } from './assistant-config'

const container = ref<HTMLDivElement | null>(null)
const error = ref('')
let harness: PiController | undefined
let closed = false
onMounted(async function mount() {
  defineWebMCPChat()
  try {
    const next = await createPiHarness(harnessOptions)
    if (closed) {
      await next.destroy()
      return
    }
    harness = next
    const chat = document.createElement('webmcp-chat') as WebMCPChatElement
    chat.configure({ harness })
    container.value?.append(chat)
  } catch (cause) {
    if (!closed)
      error.value = cause instanceof Error ? cause.message : 'The assistant could not start.'
  }
})
onUnmounted(function cleanup() {
  closed = true
  void harness?.destroy()
})
</script>
```
