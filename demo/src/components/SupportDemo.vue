<template>
  <DemoShell
    :activity-items="activityItems"
    :confirmations-enabled="settings.confirmationsEnabled"
    :eyebrow="`${tickets.length} tickets`"
    :expected-tool-call="story.expectedToolCall"
    :get-context="getPlannerContext"
    :guide-command="story.guideCommand"
    :metrics="metrics"
    :placeholder="story.placeholder"
    :proof-description="story.proofDescription"
    :proof-points="story.proofPoints"
    :proof-title="story.proofTitle"
    :registered-tools-count="registeredToolsCount"
    :safety="story.safety"
    :description="story.description"
    :suggestions="story.suggestions"
    :title="story.title"
  >
    <section class="demo-page-content demo-page-content--support">
      <DemoSupportTicketPanel
        ref="supportTicketPanel"
        :account="supportAccount"
        :body="supportBody"
        :subject="supportSubject"
        @submit="submitSupportForm"
        @update:account="supportAccount = $event"
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
import { defineTool, invokeTool, registerFormTool } from 'webmcp-kit'
import { computed, ref } from 'vue'

import DemoShell from '@/components/DemoShell.vue'
import DemoSupportTicketPanel from '@/components/DemoSupportTicketPanel.vue'
import DemoTicketBoard from '@/components/DemoTicketBoard.vue'
import { useDemoTools } from '@/composables/use-demo-tools'
import type { DemoMetric, SupportTicket } from '@/interfaces/demo'
import { getDemoRouteStory, getInitialTickets } from '@/utils/demo-data'

const tickets = ref<SupportTicket[]>(getInitialTickets())
const story = getDemoRouteStory('support')
const supportTicketPanel = ref<{ supportForm: HTMLFormElement | null } | null>(null)
const supportAccount = ref('Northwind')
const supportSubject = ref('Billing access')
const supportBody = ref('I cannot open the latest invoice from the workspace.')
const {
  activityItems,
  addActivity,
  registerDemoTool,
  registeredToolsCount,
  settings,
  trackUnregister
} = useDemoTools({
  registerTools() {
    registerSupportTools()
    registerSupportFormTool()
  },
  seedActivity: [
    {
      id: 'support-seed',
      kind: 'system',
      time: '09:18',
      title: 'Support queue loaded',
      detail: 'Tickets include account, SLA age, priority, and ownership context.'
    }
  ]
})
const metrics = computed<DemoMetric[]>(function getSupportMetrics() {
  const urgent = tickets.value.filter(function filterUrgent(ticket) {
    return ticket.priority === 'urgent' || ticket.priority === 'high'
  }).length
  const unresolved = tickets.value.filter(function filterUnresolved(ticket) {
    return ticket.status !== 'resolved'
  }).length
  const oldest = Math.max(
    ...tickets.value.map(function mapAge(ticket) {
      return ticket.ageHours
    })
  )

  return [
    {
      label: 'Unresolved',
      value: String(unresolved),
      tone: unresolved > 0 ? 'warn' : 'good'
    },
    {
      label: 'High priority',
      value: String(urgent),
      tone: urgent > 0 ? 'danger' : 'good'
    },
    {
      label: 'Oldest SLA',
      value: `${oldest}h`,
      tone: oldest > 24 ? 'danger' : 'good'
    }
  ]
})

function registerSupportTools() {
  registerDemoTool(
    defineTool({
      name: 'update_ticket',
      description:
        'Update a support ticket status, assignee, or priority from the visible ticket board.',
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
        return (
          tickets.value.some(function hasTicket(ticket) {
            return ticket.id === String(input.id ?? '')
          }) || 'Ticket is not visible in the current board.'
        )
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
        const updatedTicket = tickets.value.find(function findTicket(ticket) {
          return ticket.id === String(input.id)
        })
        if (updatedTicket) {
          addActivity(
            'ai',
            'Ticket updated',
            `${updatedTicket.subject} is ${updatedTicket.status} and owned by ${updatedTicket.assignee}.`
          )
        }
        return tickets.value.find(function findTicket(ticket) {
          return ticket.id === String(input.id)
        })
      }
    })
  )
}

function registerSupportFormTool() {
  const form = supportTicketPanel.value?.supportForm
  if (!form) return

  trackUnregister(
    registerFormTool({
      form,
      name: 'create_support_ticket',
      description:
        'Create a support ticket from the visible support form and mark it as open for triage.',
      execute(input) {
        return createSupportTicket(
          String(input.account ?? supportAccount.value),
          String(input.subject ?? 'Support request'),
          String(input.body ?? '')
        )
      }
    }).unregister
  )
}

function updateTicketStatus(id: string, status: SupportTicket['status']) {
  tickets.value = tickets.value.map(function mapTicket(ticket) {
    if (ticket.id !== id) return ticket
    return {
      ...ticket,
      status
    }
  })
  addActivity('manual', 'Ticket status updated', `${id} moved to ${status}.`)
}

function updateTicketAssignee(id: string, assignee: string) {
  tickets.value = tickets.value.map(function mapTicket(ticket) {
    if (ticket.id !== id) return ticket
    return {
      ...ticket,
      assignee
    }
  })
  addActivity('manual', 'Ticket assigned', `${id} assigned to ${assignee}.`)
}

function updateTicketPriority(id: string, priority: SupportTicket['priority']) {
  tickets.value = tickets.value.map(function mapTicket(ticket) {
    if (ticket.id !== id) return ticket
    return {
      ...ticket,
      priority
    }
  })
  addActivity('manual', 'Ticket priority updated', `${id} changed to ${priority}.`)
}

async function submitSupportForm() {
  await invokeTool({
    toolName: 'create_support_ticket',
    input: {
      subject: supportSubject.value,
      account: supportAccount.value,
      body: supportBody.value
    }
  })
}

function getPlannerContext() {
  return {
    settings: settings.value,
    tickets: tickets.value
  }
}

function createSupportTicket(account: string, subject: string, body: string): SupportTicket {
  const ticket = {
    account,
    ageHours: 0,
    id: `ticket_${Date.now()}`,
    subject,
    body,
    status: 'new' as const,
    priority: 'medium' as const,
    assignee: 'Unassigned'
  }
  tickets.value = [ticket, ...tickets.value]
  addActivity('manual', 'Support ticket created', `${subject} opened for ${account}.`)
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
