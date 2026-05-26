<template>
  <section class="ticket-board">
    <div class="panel-heading">
      <h2>Ticket board</h2>
    </div>

    <div class="board-columns">
      <article v-for="column in columns" :key="column.status" class="board-column">
        <h3>{{ column.label }}</h3>
        <div v-for="ticket in ticketsByStatus(column.status)" :key="ticket.id" class="ticket-card">
          <strong>{{ ticket.subject }}</strong>
          <span>{{ ticket.account }} · {{ ticket.ageHours }}h open</span>
          <p>{{ ticket.body }}</p>
          <div class="ticket-controls">
            <select
              :key="`${ticket.id}-status-${ticket.status}`"
              :value="ticket.status"
              :aria-label="`Status for ${ticket.subject}`"
              @change="updateStatus(ticket.id, $event)"
            >
              <option value="new" :selected="ticket.status === 'new'">New</option>
              <option value="triaged" :selected="ticket.status === 'triaged'">Triaged</option>
              <option value="in_progress" :selected="ticket.status === 'in_progress'">
                In progress
              </option>
              <option value="resolved" :selected="ticket.status === 'resolved'">Resolved</option>
            </select>
            <select
              :key="`${ticket.id}-assignee-${ticket.assignee}`"
              :value="ticket.assignee"
              :aria-label="`Assignee for ${ticket.subject}`"
              @change="updateAssignee(ticket.id, $event)"
            >
              <option value="Unassigned" :selected="ticket.assignee === 'Unassigned'">
                Unassigned
              </option>
              <option value="Carlos" :selected="ticket.assignee === 'Carlos'">Carlos</option>
              <option value="Marta" :selected="ticket.assignee === 'Marta'">Marta</option>
              <option value="Rui" :selected="ticket.assignee === 'Rui'">Rui</option>
              <option value="Sofia" :selected="ticket.assignee === 'Sofia'">Sofia</option>
            </select>
            <select
              :key="`${ticket.id}-priority-${ticket.priority}`"
              :value="ticket.priority"
              :aria-label="`Priority for ${ticket.subject}`"
              @change="updatePriority(ticket.id, $event)"
            >
              <option value="low" :selected="ticket.priority === 'low'">Low</option>
              <option value="medium" :selected="ticket.priority === 'medium'">Medium</option>
              <option value="high" :selected="ticket.priority === 'high'">High</option>
              <option value="urgent" :selected="ticket.priority === 'urgent'">Urgent</option>
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
  gap: clamp(0.75rem, 1.5vw, 1rem);
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
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr));
  gap: 10px;
  min-width: 0;
}

.board-column {
  display: grid;
  align-content: start;
  gap: 10px;
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

.ticket-card span,
.ticket-card p {
  margin: 0;
  color: #9ea8a1;
}

.ticket-card span {
  color: #e8be53;
  font-size: 0.8rem;
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
