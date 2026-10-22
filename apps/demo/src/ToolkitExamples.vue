<template>
  <div class="toolkit">
    <div class="preview-heading">
      <h2>Toolkit helpers</h2>
      <span class="small-label">/command-input · /zod · /vue · /devtools</span>
    </div>
    <p class="section-description">
      This view registers its own tools while it is open. Leave the view to unregister them.
    </p>
    <section class="toolkit-block" aria-labelledby="command-title">
      <h3 id="command-title">Command input</h3>
      <p class="section-description">
        The offline local resolver maps a short command to a registered tool. No model runs.
      </p>
      <div ref="commandHost"></div>
    </section>
    <section class="toolkit-block" aria-labelledby="zod-title">
      <h3 id="zod-title">Zod tool through the Vue helper</h3>
      <p class="section-description">
        <code>defineZodTool</code> defines <code>format_greeting</code>.
        <code>useWebMCPTool</code> registers it while the switch is on.
      </p>
      <label class="toolkit-choice"
        ><input v-model="greetingAvailable" type="checkbox" /> Expose
        <code>format_greeting</code></label
      >
    </section>
    <section class="toolkit-block" aria-labelledby="form-title">
      <h3 id="form-title">Form tool</h3>
      <p class="section-description">
        <code>registerFormTool</code> infers <code>fill_contact_form</code> from these fields and
        their native constraints. The tool fills the draft; it does not send it.
      </p>
      <form ref="contactForm" class="toolkit-form" @submit.prevent>
        <div class="toolkit-field">
          <label for="contact-name">Name</label>
          <input id="contact-name" name="name" required maxlength="40" />
        </div>
        <div class="toolkit-field">
          <label for="contact-topic">Topic</label>
          <select id="contact-topic" name="topic">
            <option value="billing">Billing</option>
            <option value="support">Support</option>
          </select>
        </div>
        <label class="toolkit-choice"><input name="urgent" type="checkbox" /> Urgent</label>
      </form>
      <p class="toolkit-status" role="status">{{ status }}</p>
    </section>
    <section v-if="devtoolsEnabled" class="toolkit-block" aria-labelledby="devtools-title">
      <h3 id="devtools-title">Devtools overlay</h3>
      <p class="section-description">
        Development builds load the inspector on demand. Use it to inspect and invoke these tools.
      </p>
      <div ref="devtoolsHost"></div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { createResolver } from '@vampaz/webmcp-kit'
import {
  defineWebMCPCommandInput,
  type WebMCPCommandInputElement
} from '@vampaz/webmcp-kit/command-input'
import type { DevtoolsOverlay } from '@vampaz/webmcp-kit/devtools'
import { useWebMCPTool } from '@vampaz/webmcp-kit/vue'
import { createGreetingTool, registerContactFormTool } from './toolkit'

const devtoolsEnabled = import.meta.env.DEV
const greetingAvailable = ref(true)
const status = ref('No form fill yet.')
const commandHost = ref<HTMLDivElement | null>(null)
const contactForm = ref<HTMLFormElement | null>(null)
const devtoolsHost = ref<HTMLDivElement | null>(null)
let formTool: ReturnType<typeof registerContactFormTool> | undefined
let overlay: DevtoolsOverlay | undefined
let closed = false

useWebMCPTool(createGreetingTool(), { when: greetingAvailable })

async function start() {
  formTool = registerContactFormTool(contactForm.value!, function filled(input) {
    status.value = `fill_contact_form: ${JSON.stringify(input)}`
  })
  defineWebMCPCommandInput()
  const resolver = await createResolver({ provider: 'local' })
  if (closed) return
  const commandInput = document.createElement('webmcp-command-input') as WebMCPCommandInputElement
  commandInput.configure({ resolver, placeholder: 'Format a greeting for Ada' })
  commandHost.value?.append(commandInput)
  if (import.meta.env.DEV) {
    const { mountDevtoolsOverlay } = await import('@vampaz/webmcp-kit/devtools')
    if (closed) return
    overlay = mountDevtoolsOverlay({ container: devtoolsHost.value!, placement: 'inline' })
  }
}

onMounted(function mount() {
  start().catch(function report(error: unknown) {
    if (!closed)
      status.value =
        error instanceof Error ? error.message : 'The toolkit examples could not start.'
  })
})
onUnmounted(function unmount() {
  closed = true
  formTool?.unregister()
  overlay?.destroy()
})
</script>

<style scoped>
.toolkit {
  display: grid;
  gap: 1.25rem;
}
.toolkit-block {
  display: grid;
  gap: 0.6rem;
  padding-block-start: 1.25rem;
  border-block-start: 1px solid var(--lab-border);
}
.toolkit-block h3 {
  font-size: 0.85rem;
  font-weight: 650;
}
.toolkit-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  align-items: end;
  gap: 0.75rem;
  font-size: 0.8rem;
}
.toolkit-field {
  display: grid;
  gap: 0.3rem;
}
.toolkit-choice {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
}
.toolkit-status {
  font-size: 0.7rem;
  color: var(--lab-muted);
  overflow-wrap: anywhere;
}
</style>
