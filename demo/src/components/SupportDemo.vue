<template>
  <DemoShell
    :confirmations-enabled="settings.confirmationsEnabled"
    :eyebrow="`${tickets.length} tickets`"
    :get-context="getPlannerContext"
    :registered-tools-count="registeredToolsCount"
    title="Support"
  >
    <section class="demo-page-content demo-page-content--support">
      <DemoSupportTicketPanel
        ref="supportTicketPanel"
        :body="supportBody"
        :subject="supportSubject"
        @submit="submitSupportForm"
        @update:body="supportBody = $event"
        @update:subject="supportSubject = $event"
      />

      <DemoTicketBoard
        :tickets="tickets"
        @update-ticket-assignee="updateTicketAssignee"
        @update-ticket-priority="updateTicketPriority"
        @update-ticket-status="updateTicketStatus"
      />
    </section>
  </DemoShell>
</template>

<script setup lang="ts">
import { defineTool, invokeTool, listTools, registerFormTool, registerTool } from '@webmcp-kit/core'
import { onMounted, onUnmounted, ref } from 'vue'

import DemoShell from '@/components/DemoShell.vue'
import DemoSupportTicketPanel from '@/components/DemoSupportTicketPanel.vue'
import DemoTicketBoard from '@/components/DemoTicketBoard.vue'
import type { SupportTicket } from '@/interfaces/demo'
import { getInitialDemoSettings, getInitialTickets } from '@/utils/demo-data'

const tickets = ref<SupportTicket[]>(getInitialTickets())
const settings = ref(getInitialDemoSettings())
const registeredToolsCount = ref(0)
const supportTicketPanel = ref<{ supportForm: HTMLFormElement | null } | null>(null)
const supportSubject = ref('Billing access')
const supportBody = ref('I cannot open the latest invoice from the workspace.')
const unregisterCallbacks: Array<() => void> = []

onMounted(function handleMounted() {
  registerSupportTools()
  registerSupportFormTool()
  refreshTools()
})

onUnmounted(function handleUnmounted() {
  for (const unregister of unregisterCallbacks) {
    unregister()
  }
})

function registerSupportTools() {
  unregisterCallbacks.push(registerTool(defineTool({
    name: 'update_ticket',
    description: 'Update a support ticket status, assignee, or priority from the visible ticket board.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string'
        },
        status: {
          type: 'string',
          enum: ['new', 'triaged', 'in_progress', 'resolved']
        },
        assignee: {
          type: 'string'
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent']
        }
      },
      required: ['id'],
      additionalProperties: false
    },
    guard(input) {
      return tickets.value.some(function hasTicket(ticket) {
        return ticket.id === String(input.id ?? '')
      }) || 'Ticket is not visible in the current board.'
    },
    execute(input) {
      tickets.value = tickets.value.map(function mapTicket(ticket) {
        if (ticket.id !== String(input.id)) return ticket
        return {
          ...ticket,
          assignee: typeof input.assignee === 'string' ? input.assignee : ticket.assignee,
          priority: isTicketPriority(input.priority) ? input.priority : ticket.priority,
          status: isTicketStatus(input.status) ? input.status : ticket.status
        }
      })
      return tickets.value.find(function findTicket(ticket) {
        return ticket.id === String(input.id)
      })
    }
  })).unregister)
}

function registerSupportFormTool() {
  const form = supportTicketPanel.value?.supportForm
  if (!form) return

  unregisterCallbacks.push(registerFormTool({
    form,
    name: 'create_support_ticket',
    description: 'Create a support ticket from the visible support form and mark it as open for triage.',
    execute(input) {
      return createSupportTicket(String(input.subject ?? 'Support request'), String(input.body ?? ''))
    }
  }).unregister)
}

function updateTicketStatus(id: string, status: SupportTicket['status']) {
  tickets.value = tickets.value.map(function mapTicket(ticket) {
    if (ticket.id !== id) return ticket
    return {
      ...ticket,
      status
    }
  })
}

function updateTicketAssignee(id: string, assignee: string) {
  tickets.value = tickets.value.map(function mapTicket(ticket) {
    if (ticket.id !== id) return ticket
    return {
      ...ticket,
      assignee
    }
  })
}

function updateTicketPriority(id: string, priority: SupportTicket['priority']) {
  tickets.value = tickets.value.map(function mapTicket(ticket) {
    if (ticket.id !== id) return ticket
    return {
      ...ticket,
      priority
    }
  })
}

async function submitSupportForm() {
  await invokeTool({
    toolName: 'create_support_ticket',
    input: {
      subject: supportSubject.value,
      body: supportBody.value
    }
  })
}

function refreshTools() {
  registeredToolsCount.value = listTools().length
}

function getPlannerContext() {
  return {
    settings: settings.value,
    tickets: tickets.value
  }
}

function createSupportTicket(subject: string, body: string): SupportTicket {
  const ticket = {
    id: `ticket_${Date.now()}`,
    subject,
    body,
    status: 'new' as const,
    priority: 'medium' as const,
    assignee: 'Unassigned'
  }
  tickets.value = [ticket, ...tickets.value]
  return ticket
}

function isTicketStatus(value: unknown): value is SupportTicket['status'] {
  return value === 'new' || value === 'triaged' || value === 'in_progress' || value === 'resolved'
}

function isTicketPriority(value: unknown): value is SupportTicket['priority'] {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'urgent'
}
</script>

<style scoped>
.demo-page-content {
  display: grid;
  min-width: 0;
  gap: clamp(0.9rem, 1.6vw, 1.25rem);
}

.demo-page-content--support {
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
}

@media (min-width: 76rem) {
  .demo-page-content--support {
    grid-template-columns: minmax(20rem, 24rem) minmax(0, 1fr);
  }
}
</style>
