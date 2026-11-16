<template>
  <h1>Packed Vue consumer</h1>
  <p id="registry-count">{{ registryCount }}</p>
  <p v-if="error" role="alert">{{ error }}</p>
  <div ref="container"></div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { listTools } from '@vampaz/webmcp-kit'
import { useWebMCPTool } from '@vampaz/webmcp-kit/vue'
import { mountAssistant, type MountedAssistant } from '@vampaz/webmcp-kit/assistant'
import { createScriptedResolver } from '@vampaz/webmcp-kit/testing'

const registryCount = ref(0)
const error = ref('')
const container = ref<HTMLDivElement | null>(null)
let assistant: MountedAssistant | undefined
let closed = false

useWebMCPTool({
  name: 'read_value',
  description: 'Read the current application value.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  execute() {
    return { value: 7 }
  }
})

onMounted(async function mount() {
  if (!container.value) return
  assistant = mountAssistant({
    container: container.value,
    session: { namespace: 'packed-consumer', ownerId: 'test', conversationId: 'one' },
    resolver: createScriptedResolver({
      name: 'Package fixture',
      detail: 'Package test',
      steps: [
        {
          match: /Read/i,
          resolution: {
            toolName: 'read_value',
            input: {},
            confidence: 1,
            reason: 'Package fixture'
          }
        }
      ],
      fallback() {
        return {
          toolName: 'pi_reply',
          input: { text: 'Packed Pi read 7' },
          confidence: 1,
          reason: 'Package fixture'
        }
      }
    })
  })
  try {
    await assistant.ready
    if (!closed) registryCount.value = listTools().length
  } catch (cause) {
    if (!closed) error.value = cause instanceof Error ? cause.message : String(cause)
  }
})

onUnmounted(function cleanup() {
  closed = true
  void assistant?.destroy()
})
</script>
