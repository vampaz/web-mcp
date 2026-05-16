<template>
  <aside class="tools-panel support-panel">
    <div class="panel-heading">
      <p class="eyebrow">Registered form tool</p>
      <h2>Support ticket</h2>
    </div>

    <form ref="supportForm" class="support-form" @submit.prevent="submitForm">
      <label>
        Subject
        <input :value="subject" name="subject" required data-tool-description="Short issue summary." @input="updateSubject" />
      </label>
      <label>
        Details
        <textarea :value="body" name="body" required rows="5" data-tool-description="Detailed issue description." @input="updateBody" />
      </label>
      <button class="primary-action" type="submit">Create ticket</button>
    </form>

    <p class="helper-copy">
      This form is registered through `registerFormTool()`, which applies WebMCP form metadata and exposes the same action to the devtools overlay.
    </p>
  </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface Props {
  body: string
  subject: string
}

withDefaults(defineProps<Props>(), {})
const emit = defineEmits<{
  submit: []
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

function updateBody(event: Event) {
  emit('update:body', getInputValue(event))
}

function updateSubject(event: Event) {
  emit('update:subject', getInputValue(event))
}

function getInputValue(event: Event): string {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
    ? event.target.value
    : ''
}
</script>

<style scoped>
.tools-panel {
  padding: clamp(18px, 3vw, 28px);
  border: 1px solid rgba(244, 240, 232, 0.14);
  background: rgba(12, 17, 16, 0.72);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.26);
  backdrop-filter: blur(18px);
}

.panel-heading {
  display: grid;
  gap: 8px;
  margin-bottom: 18px;
}

.eyebrow {
  margin: 0;
  color: #e8be53;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
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

.helper-copy {
  margin: 14px 0 0;
  color: #9ea8a1;
  line-height: 1.5;
}
</style>
