<template>
  <aside class="tools-panel">
    <div class="panel-heading">
      <h2>Support request</h2>
    </div>

    <form ref="supportForm" class="support-form" @submit.prevent="submitForm">
      <label>
        Account
        <select
          :value="account"
          name="account"
          toolparamdescription="Customer account connected to this ticket."
          @change="updateAccount"
        >
          <option>Northwind</option>
          <option>Globex</option>
          <option>Stark Industries</option>
          <option>Aperture Labs</option>
          <option>Umbrella Health</option>
        </select>
      </label>
      <label>
        Subject
        <input
          :value="subject"
          name="subject"
          maxlength="80"
          minlength="4"
          required
          toolparamdescription="Short issue summary."
          @input="updateSubject"
        />
      </label>
      <label>
        Details
        <textarea
          :value="body"
          name="body"
          maxlength="500"
          minlength="12"
          required
          rows="5"
          toolparamdescription="Detailed issue description."
          @input="updateBody"
        />
      </label>
      <button class="primary-action" type="submit">Create ticket</button>
    </form>
  </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Props {
  account: string
  body: string
  subject: string
}

withDefaults(defineProps<Props>(), {})
const emit = defineEmits<{
  submit: []
  'update:account': [value: string]
  'update:body': [value: string]
  'update:subject': [value: string]
}>()
const supportForm = ref<HTMLFormElement | null>(null)

defineExpose({
  supportForm
})

function submitForm() {
  emit('submit')
}

function updateAccount(event: Event) {
  emit('update:account', getInputValue(event))
}

function updateBody(event: Event) {
  emit('update:body', getInputValue(event))
}

function updateSubject(event: Event) {
  emit('update:subject', getInputValue(event))
}

function getInputValue(event: Event): string {
  return event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement
    ? event.target.value
    : ''
}
</script>

<style scoped>
.tools-panel {
  padding: clamp(0.9rem, 1.8vw, 1.25rem);
  border: 1px solid var(--demo-rule-strong);
  background: var(--demo-paper-wash);
}

.panel-heading {
  display: grid;
  gap: 0.5rem;
  min-block-size: 2.35rem;
  align-items: center;
  margin-bottom: clamp(0.75rem, 1.5vw, 1rem);
}

h2 {
  margin: 0;
  font-size: clamp(1.05rem, 1.5vw, 1.32rem);
  letter-spacing: 0;
}

.support-form {
  display: grid;
  gap: 0.75rem;
}

.support-form label {
  display: grid;
  gap: 0.5rem;
  color: var(--demo-muted);
  font-size: 0.92rem;
}

.support-form input,
.support-form select,
textarea {
  width: 100%;
  border: 1px solid var(--demo-rule-strong);
  outline: none;
  background: var(--demo-paper);
  color: var(--demo-ink);
  font: inherit;
  font-size: 1rem;
}

.support-form input {
  min-block-size: 2.88rem;
  padding: 0.75rem;
}

.support-form select {
  min-block-size: 2.88rem;
  padding: 0 0.75rem;
}

textarea {
  resize: vertical;
  min-block-size: 8.25rem;
  padding: 0.75rem;
  line-height: 1.5;
}

.support-form input:focus,
textarea:focus {
  border-color: var(--demo-blue);
  box-shadow: 0 0 0 4px var(--demo-blue-soft);
}

.primary-action {
  width: 100%;
  padding: 0.56rem 0.75rem;
  border: 1px solid var(--demo-blue);
  background: var(--demo-blue);
  color: var(--demo-paper-wash);
  font: inherit;
  font-weight: 900;
}
</style>
