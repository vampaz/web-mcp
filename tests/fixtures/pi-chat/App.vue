<template>
  <h1>Packed Vue consumer</h1>
  <p id="registry-count">{{ registryCount }}</p>
  <button type="button" @click="showPopup">Use popup</button>
  <div ref="container"></div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { registerTool, listTools } from '@vampaz/webmcp-kit'
import { createPiHarness, type PiController } from '@vampaz/webmcp-kit/pi'
import { defineWebMCPChat, type WebMCPChatElement } from '@vampaz/webmcp-kit/chat'

const registryCount = ref(0)
const container = ref<HTMLDivElement | null>(null)
let harness: PiController | undefined
let closed = false
let tool: ReturnType<typeof registerTool> | undefined
let chat: WebMCPChatElement | undefined

function showPopup() {
  if (harness) chat?.configure({ harness, mode: 'popup' })
}

onMounted(async function mount() {
  tool = registerTool({
    name: 'read_value',
    description: 'Read the current application value.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute() {
      return { value: 7 }
    }
  })
  const next = await createPiHarness({
    session: { namespace: 'packed-consumer', ownerId: 'test', conversationId: 'one' },
    worker: { url: '/nested/webmcp-pi/worker.js', scope: '/nested/webmcp-pi/' },
    resolver: {
      name: 'Package fixture',
      capabilities: { conversation: true },
      available: true,
      status: 'ready',
      detail: 'Package test',
      async resolve(_message, _tools, context) {
        const completed = JSON.stringify(context?.piConversation).includes('toolResult')
        return {
          toolName: completed ? 'pi_reply' : 'read_value',
          input: completed ? { text: 'Packed worker read 7' } : {},
          confidence: 1,
          reason: 'Package fixture'
        }
      }
    }
  })
  if (closed) {
    await next.destroy()
    return
  }
  harness = next
  defineWebMCPChat()
  const element = document.createElement('webmcp-chat') as WebMCPChatElement
  chat = element
  element.configure({ harness })
  container.value?.append(element)
  registryCount.value = listTools().length
})
onUnmounted(function cleanup() {
  closed = true
  void harness?.destroy()
  tool?.unregister()
})
</script>
