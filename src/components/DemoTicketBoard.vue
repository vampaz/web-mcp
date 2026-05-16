<template>
  <section class="ticket-board">
    <div class="panel-heading">
      <p class="eyebrow">Status controls</p>
      <h2>Ticket board</h2>
    </div>

    <div class="board-columns">
      <article v-for="column in columns" :key="column.status" class="board-column">
        <h3>{{ column.label }}</h3>
        <div v-for="ticket in ticketsByStatus(column.status)" :key="ticket.id" class="ticket-card">
          <strong>{{ ticket.subject }}</strong>
          <span>{{ ticket.body }}</span>
          <div class="ticket-controls">
            <select :value="ticket.status" :aria-label="`Status for ${ticket.subject}`" @change="updateStatus(ticket.id, $event)">
              <option value="new">New</option>
              <option value="triaged">Triaged</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
            </select>
            <select :value="ticket.assignee" :aria-label="`Assignee for ${ticket.subject}`" @change="updateAssignee(ticket.id, $event)">
              <option>Unassigned</option>
              <option>Carlos</option>
              <option>Marta</option>
              <option>Rui</option>
              <option>Sofia</option>
            </select>
            <select :value="ticket.priority" :aria-label="`Priority for ${ticket.subject}`" @change="updatePriority(ticket.id, $event)">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { SupportTicket } from '@/interfaces/demo'

interface BoardColumn {
  label: string
  status: SupportTicket['status']
}

interface Props {
  tickets: SupportTicket[]
}

const props = withDefaults(defineProps<Props>(), {})
const emit = defineEmits<{
  'update-ticket-assignee': [id: string, assignee: string]
  'update-ticket-priority': [id: string, priority: SupportTicket['priority']]
  'update-ticket-status': [id: string, status: SupportTicket['status']]
}>()
const columns: BoardColumn[] = [
  { label: 'New', status: 'new' },
  { label: 'Triaged', status: 'triaged' },
  { label: 'In progress', status: 'in_progress' },
  { label: 'Resolved', status: 'resolved' }
]

function ticketsByStatus(status: SupportTicket['status']): SupportTicket[] {
  return props.tickets.filter(function filterTicket(ticket) {
    return ticket.status === status
  })
}

function updateStatus(id: string, event: Event) {
  emit('update-ticket-status', id, getInputValue(event) as SupportTicket['status'])
}

function updateAssignee(id: string, event: Event) {
  emit('update-ticket-assignee', id, getInputValue(event))
}

function updatePriority(id: string, event: Event) {
  emit('update-ticket-priority', id, getInputValue(event) as SupportTicket['priority'])
}

function getInputValue(event: Event): string {
  return event.target instanceof HTMLSelectElement ? event.target.value : ''
}
</script>

<style scoped>
.ticket-board {
  display: grid;
  gap: 14px;
  padding: clamp(18px, 3vw, 28px);
  border: 1px solid rgba(244, 240, 232, 0.14);
  background: rgba(12, 17, 16, 0.72);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.26);
  backdrop-filter: blur(18px);
}

.panel-heading {
  display: grid;
  gap: 8px;
}

.eyebrow {
  margin: 0;
  color: #e8be53;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

h2,
h3 {
  margin: 0;
}

h2 {
  font-size: clamp(1.05rem, 1.5vw, 1.32rem);
}

h3 {
  color: #c9d1cb;
  font-size: 0.86rem;
  text-transform: uppercase;
}

.board-columns {
  display: grid;
  grid-template-columns: repeat(4, minmax(180px, 1fr));
  gap: 10px;
  overflow: auto;
}

.board-column {
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 260px;
  padding: 10px;
  border: 1px solid rgba(244, 240, 232, 0.12);
  background: rgba(244, 240, 232, 0.04);
}

.ticket-card {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid rgba(244, 240, 232, 0.12);
  background: rgba(0, 0, 0, 0.16);
}

.ticket-card span {
  color: #9ea8a1;
}

.ticket-controls {
  display: grid;
  gap: 6px;
}

select {
  min-width: 0;
  min-height: 34px;
  padding: 6px 8px;
  border: 1px solid rgba(244, 240, 232, 0.18);
  background: #f4f0e8;
  color: #0c1110;
  font: inherit;
}
</style>
