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
  border: 1px solid rgba(244, 240, 232, 0.12);
  background: rgba(12, 17, 16, 0.82);
  backdrop-filter: blur(18px);
}

.panel-heading {
  display: grid;
  gap: 8px;
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
  gap: 12px;
}

.support-form label {
  display: grid;
  gap: 8px;
  color: #c9d1cb;
  font-size: 0.92rem;
}

.support-form input,
.support-form select,
textarea {
  width: 100%;
  border: 1px solid rgba(244, 240, 232, 0.2);
  outline: none;
  background: #f4f0e8;
  color: #0c1110;
  font: inherit;
}

.support-form input {
  min-height: 46px;
  padding: 12px;
}

.support-form select {
  min-height: 46px;
  padding: 0 12px;
}

textarea {
  resize: vertical;
  min-height: 132px;
  padding: 12px;
  line-height: 1.5;
}

.support-form input:focus,
textarea:focus {
  border-color: #e8be53;
  box-shadow: 0 0 0 4px rgba(232, 190, 83, 0.2);
}

.primary-action {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid #e8be53;
  background: #e8be53;
  color: #0c1110;
  font: inherit;
  font-weight: 900;
}
</style>
