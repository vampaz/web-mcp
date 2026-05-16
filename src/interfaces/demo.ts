export interface Invoice {
  id: string
  customerName: string
  amount: number
  status: 'draft' | 'sent' | 'overdue' | 'paid' | 'void'
  dueDate: string
  owner: string
  selected: boolean
}

export interface Product {
  id: string
  name: string
  category: string
  price: number
}

export interface CartLine {
  productId: string
  name: string
  quantity: number
  price: number
}

export interface SupportTicket {
  id: string
  subject: string
  body: string
  status: 'new' | 'triaged' | 'in_progress' | 'resolved'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  assignee: string
}

export interface ActivityItem {
  id: string
  title: string
  detail: string
  tone: 'info' | 'success' | 'warning' | 'error'
}

export interface PlannerModelOption {
  id: string
  label: string
}

export interface OutcomeRow {
  id: string
  title: string
  value: string
  meta: string
}

export interface InvoiceDraft {
  amount: number
  customerName: string
  dueDate: string
  owner: string
  status: Invoice['status']
}

export interface InvoiceFilters {
  query: string
  status: 'all' | Invoice['status']
}

export interface DemoSettings {
  confirmationsEnabled: boolean
  density: 'comfortable' | 'compact'
  notificationsEnabled: boolean
  plannerConfidence: number
}
