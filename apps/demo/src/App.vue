<template>
  <div class="site-header">
    <a class="wordmark" href="?mode=chat" aria-label="WebMCP Kit playground">
      <span class="brand-mark" aria-hidden="true">W</span> WebMCP <span>Kit</span>
    </a>
    <span class="environment"><i aria-hidden="true"></i> Local development</span>
  </div>
  <main>
    <header class="workspace-header">
      <div>
        <p class="eyebrow">Package development</p>
        <h1>WebMCP playground</h1>
        <p class="introduction">
          Test the registry, run the harness, and make the assistant your own.
        </p>
      </div>
    </header>
    <nav class="mode-nav" aria-label="Example mode">
      <a
        v-for="example in ['chat', 'harness', 'core']"
        :key="example"
        :href="`?mode=${example}`"
        :aria-current="mode === example ? 'page' : undefined"
        >{{ example[0].toUpperCase() + example.slice(1)
        }}<span class="nav-description">{{
          example === 'core'
            ? 'Tool registry'
            : example === 'harness'
              ? 'Headless agent'
              : 'Conversation UI'
        }}</span></a
      >
    </nav>
    <div class="workbench">
      <div class="application-column">
        <section class="application-panel" aria-label="Application">
          <div class="panel-heading">
            <h2>Application counter</h2>
            <span class="small-label">Live state</span>
          </div>
          <p class="section-description">
            A simple app with two registered tools. Changes require your approval.
          </p>
          <div class="counter-display">
            <output id="counter">{{ counter }}</output
            ><span>current value</span>
          </div>
          <form id="counter-form" @submit.prevent="setCounter">
            <label for="value">New value <span>(0–100)</span></label>
            <div class="counter-controls">
              <input id="value" v-model="draftValue" type="number" required /><button
                class="primary-button"
              >
                Set value</button
              ><button id="read" type="button" @click="readCounter">Read counter</button>
            </div>
          </form>
          <p id="tool-status" role="status">{{ toolResult }}</p>
        </section>
        <section class="tools-panel" aria-label="Registered tools">
          <div class="panel-heading">
            <h2>Registered tools</h2>
            <span class="tool-count">2</span>
          </div>
          <div class="tool-row">
            <div>
              <code>read_counter</code>
              <p>Read the current value.</p>
            </div>
            <span class="tool-kind">Read only</span>
          </div>
          <div class="tool-row">
            <div>
              <code>set_counter</code>
              <p>Update the application value.</p>
            </div>
            <span class="tool-kind">Approval</span>
          </div>
        </section>
        <div class="runtime-panel">
          <span class="eyebrow">Runtime</span>
          <p id="model-status" role="status">{{ modelStatus }}</p>
        </div>
      </div>
      <section id="example" class="example-panel" aria-label="Selected example">
        <template v-if="mode === 'chat'">
          <div class="preview-heading">
            <h2>Chat component</h2>
            <div class="presentation-control">
              <label for="presentation">Presentation</label
              ><select id="presentation" v-model="presentation" @change="configureChats">
                <option value="inline">Inline</option>
                <option value="popup">Popup</option>
              </select>
            </div>
          </div>
          <div v-if="presentation === 'popup'" class="popup-description">
            <span class="preview-symbol" aria-hidden="true">↗</span>
            <h3>Floating assistant</h3>
            <p>
              Open the assistant from the corner of the page. Drag it into place, resize it, or
              close it while you work.
            </p>
            <code>mode: 'popup'</code>
          </div>
          <div ref="chatHost" class="chat-host"></div>
        </template>
        <template v-else-if="mode === 'harness'">
          <div class="preview-heading">
            <h2>Headless harness</h2>
            <span class="small-label">/pi</span>
          </div>
          <p class="section-description">
            Send a request directly to the agent. The application supplies its own interface.
          </p>
          <form class="harness-form" @submit.prevent="send">
            <label for="harness-message">Message</label
            ><input
              id="harness-message"
              v-model="message"
              required
              maxlength="16000"
              :disabled="busy"
            />
            <div class="button-row">
              <button class="primary-button" type="submit" :disabled="busy">Send</button
              ><button
                type="button"
                :disabled="snapshot.state !== 'running'"
                @click="perform('stop')"
              >
                Stop</button
              ><button type="button" :disabled="busy" @click="perform('clear')">Clear chat</button>
            </div>
          </form>
          <pre id="harness-snapshot">{{ JSON.stringify(snapshot, null, 2) }}</pre>
        </template>
        <template v-else>
          <div class="preview-heading">
            <h2>The application is in control.</h2>
            <span class="small-label">/core</span>
          </div>
          <p class="section-description">
            Use the counter controls to invoke a tool. Every call uses the same schema validation
            and approval flow.
          </p>
          <div class="contract-list">
            <div>
              <span>01</span>
              <p>
                <strong>Define the action</strong>Expose the operations your app already supports.
              </p>
            </div>
            <div>
              <span>02</span>
              <p><strong>Validate the input</strong>Reject values outside the tool's schema.</p>
            </div>
            <div>
              <span>03</span>
              <p>
                <strong>Keep approval in the app</strong>The application decides whether a change
                can run.
              </p>
            </div>
          </div>
        </template>
      </section>
    </div>
    <footer class="workspace-footer">
      <span>App-owned actions. Browser-local history.</span><span>@vampaz/webmcp-kit</span>
    </footer>
  </main>
  <dialog ref="approval" class="approval-dialog" aria-labelledby="approval-title">
    <form method="dialog">
      <span class="approval-mark" aria-hidden="true">✓</span>
      <h2 id="approval-title">Approve application action</h2>
      <p id="approval-action"></p>
      <div class="dialog-actions">
        <button value="deny">Deny</button
        ><button class="primary-button" value="approve">Approve</button>
      </div>
    </form>
  </dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { getSupportLabel, invokeTool } from '@vampaz/webmcp-kit'
import type { PiController, PiSnapshot } from '@vampaz/webmcp-kit/pi'
import type { WebMCPChatElement } from '@vampaz/webmcp-kit/chat'
import { installApprovalDialog, registerCounterTools } from '@/tools'

const parameters = new URLSearchParams(location.search)
const requestedMode = parameters.get('mode') ?? 'chat'
const mode = ['core', 'harness', 'chat', 'storage'].includes(requestedMode) ? requestedMode : 'chat'
const counter = ref(0)
const draftValue = ref<number | string>(1)
const toolResult = ref('')
const modelStatus = ref(getSupportLabel())
const presentation = ref<'inline' | 'popup'>(
  parameters.get('presentation') === 'popup' ? 'popup' : 'inline'
)
const message = ref('')
const snapshot = shallowRef<PiSnapshot>({ state: 'loading', messages: [] })
const approval = ref<HTMLDialogElement | null>(null)
const chatHost = ref<HTMLDivElement | null>(null)
const busy = computed(function isBusy() {
  return ['loading', 'running', 'stopping'].includes(snapshot.value.state)
})
let controller: PiController | undefined
let tools: ReturnType<typeof registerCounterTools> | undefined
let removeApproval: (() => void) | undefined
let unsubscribe: (() => void) | undefined
let closed = false

async function setCounter() {
  toolResult.value = JSON.stringify(
    await invokeTool({ toolName: 'set_counter', input: { value: Number(draftValue.value) } })
  )
}

async function readCounter() {
  toolResult.value = JSON.stringify(await invokeTool({ toolName: 'read_counter', input: {} }))
}

async function send() {
  if (!controller || busy.value) return
  const text = message.value
  message.value = ''
  await controller.send(text)
}

async function perform(action: 'stop' | 'clear') {
  try {
    await controller?.[action]()
  } catch (error) {
    modelStatus.value =
      error instanceof Error ? error.message : 'The conversation operation failed.'
  }
}

function configureChats() {
  if (!controller) return
  for (const element of chatHost.value?.querySelectorAll<WebMCPChatElement>('webmcp-chat') ?? []) {
    element.configure({
      harness: controller,
      mode: presentation.value,
      assistantLabel: 'Assistant',
      suggestedPrompts: ['Read the counter', 'Set the counter to 7'],
      emptyState: 'Ask a question or request an action to get started.'
    })
  }
}

async function start() {
  try {
    if (mode === 'storage') {
      const config = await fetch('/__demo-config').then(function json(response) {
        return response.json()
      })
      if (!config.fixtures) throw new Error('Storage fixtures require the test server.')
      const { installStorageFixture } = await import('@/fixtures/storage')
      if (closed) return
      installStorageFixture()
      modelStatus.value = 'Storage fixture ready'
    } else if (mode === 'harness' || mode === 'chat') {
      const { openDemoHarness } = await import('@/harness')
      const next = await openDemoHarness(mode, tools!.getValue, function status(text) {
        modelStatus.value = text
      })
      if (closed) {
        await next.destroy()
        return
      }
      controller = next
      unsubscribe = controller.subscribe(function update(value) {
        snapshot.value = value
      })
      if (mode === 'chat') {
        const { defineWebMCPChat } = await import('@vampaz/webmcp-kit/chat')
        if (closed) return
        defineWebMCPChat()
        const views = parameters.has('multiple') ? 2 : 1
        for (let index = 0; index < views; index++) {
          const element = document.createElement('webmcp-chat') as WebMCPChatElement
          chatHost.value?.append(element)
        }
        configureChats()
      }
    }
  } catch (error) {
    if (!closed)
      modelStatus.value = error instanceof Error ? error.message : 'The example could not start.'
  }
}

function cleanup() {
  if (closed) return
  closed = true
  unsubscribe?.()
  void controller?.destroy()
  tools?.destroy()
  removeApproval?.()
}

function pagehide(event: PageTransitionEvent) {
  if (!event.persisted) cleanup()
}

onMounted(function mount() {
  tools = registerCounterTools(function changed(value) {
    counter.value = value
  })
  removeApproval = installApprovalDialog(approval.value!)
  window.addEventListener('pagehide', pagehide)
  void start()
})
onUnmounted(function unmount() {
  cleanup()
  window.removeEventListener('pagehide', pagehide)
})
</script>
