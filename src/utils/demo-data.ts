import type { ActivityItem, DemoSettings, Invoice, InvoiceDraft, PlannerModelOption, Product, SupportTicket } from '@/interfaces/demo'

export function getCloudflareBindingModels(): PlannerModelOption[] {
  return [
    {
      id: '@cf/google/gemma-4-26b-a4b-it',
      label: 'Gemma 4 26B A4B'
    },
    {
      id: '@cf/moonshotai/kimi-k2.6',
      label: 'Kimi K2.6'
    },
    {
      id: '@cf/zai-org/glm-4.7-flash',
      label: 'GLM 4.7 Flash'
    },
    {
      id: '@cf/qwen/qwen3-30b-a3b-fp8',
      label: 'Qwen3 30B A3B FP8'
    },
    {
      id: '@cf/openai/gpt-oss-20b',
      label: 'GPT OSS 20B'
    },
    {
      id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
      label: 'DeepSeek R1 Distill Qwen 32B'
    },
    {
      id: '@cf/qwen/qwq-32b',
      label: 'Qwen QwQ 32B'
    },
    {
      id: '@cf/meta/llama-3.1-8b-instruct',
      label: 'Llama 3.1 8B Instruct'
    },
    {
      id: '@cf/meta/llama-3.2-3b-instruct',
      label: 'Llama 3.2 3B Instruct'
    }
  ]
}

export function getInitialInvoices(): Invoice[] {
  return [
    { id: 'inv_100', customerName: 'Globex', amount: 230, status: 'sent', dueDate: '2026-05-20', owner: 'Marta', selected: false },
    { id: 'inv_101', customerName: 'Northwind', amount: 920, status: 'overdue', dueDate: '2026-05-05', owner: 'Carlos', selected: false },
    { id: 'inv_102', customerName: 'Aperture Labs', amount: 1480, status: 'draft', dueDate: '2026-05-28', owner: 'Sofia', selected: false },
    { id: 'inv_103', customerName: 'Initech', amount: 640, status: 'paid', dueDate: '2026-05-11', owner: 'Rui', selected: false },
    { id: 'inv_104', customerName: 'Stark Industries', amount: 2310, status: 'overdue', dueDate: '2026-05-02', owner: 'Carlos', selected: false },
    { id: 'inv_105', customerName: 'Umbrella Health', amount: 790, status: 'sent', dueDate: '2026-05-23', owner: 'Marta', selected: false },
    { id: 'inv_106', customerName: 'Soylent Systems', amount: 510, status: 'draft', dueDate: '2026-06-01', owner: 'Sofia', selected: false },
    { id: 'inv_107', customerName: 'Wayne Logistics', amount: 1750, status: 'sent', dueDate: '2026-05-18', owner: 'Rui', selected: false }
  ]
}

export function getInitialProducts(): Product[] {
  return [
    { id: 'kbd-01', name: 'Low-profile keyboard', category: 'Input', price: 129 },
    { id: 'dock-02', name: 'Travel USB-C dock', category: 'Connectivity', price: 89 },
    { id: 'cam-03', name: 'Desk camera', category: 'Video', price: 149 }
  ]
}

export function getInitialActivity(): ActivityItem[] {
  return [
    {
      id: 'activity_1',
      title: 'Demo ready',
      detail: 'Tools will register when the Vue island mounts.',
      tone: 'info'
    }
  ]
}

export function getInitialTickets(): SupportTicket[] {
  return [
    {
      id: 'ticket_1',
      subject: 'Billing access',
      body: 'Cannot open the latest invoice from the workspace.',
      status: 'new',
      priority: 'high',
      assignee: 'Unassigned'
    },
    {
      id: 'ticket_2',
      subject: 'Camera order',
      body: 'Customer asked for an updated delivery estimate.',
      status: 'triaged',
      priority: 'medium',
      assignee: 'Marta'
    },
    {
      id: 'ticket_3',
      subject: 'Checkout confirmation',
      body: 'Need review of checkout confirmation copy.',
      status: 'in_progress',
      priority: 'low',
      assignee: 'Carlos'
    }
  ]
}

export function getInitialInvoiceDraft(): InvoiceDraft {
  return {
    amount: 500,
    customerName: 'Northwind',
    dueDate: '2026-05-30',
    owner: 'Carlos',
    status: 'draft'
  }
}

export function getInitialDemoSettings(): DemoSettings {
  return {
    confirmationsEnabled: true,
    density: 'compact',
    notificationsEnabled: true,
    plannerConfidence: 72
  }
}
