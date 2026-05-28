export interface Invoice {
  id: string
  customerId: string
  customerName: string
  amount: number
  status: 'draft' | 'sent' | 'overdue' | 'paid' | 'void'
  dueDate: string
  owner: string
  risk: 'low' | 'medium' | 'high'
  selected: boolean
}

export interface SelectableItem {
  aisle: string
  demand: 'low' | 'normal' | 'high'
  id: string
  margin: number
  name: string
  stock: number
  selected: boolean
  supplier: string
}

export interface Product {
  available: number
  id: string
  name: string
  category: string
  price: number
  sku: string
}

export interface CartLine {
  productId: string
  name: string
  quantity: number
  price: number
}

export interface SupportTicket {
  account: string
  ageHours: number
  id: string
  subject: string
  body: string
  status: 'new' | 'triaged' | 'in_progress' | 'resolved'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  assignee: string
}

export interface Customer {
  accountTier: 'starter' | 'growth' | 'enterprise'
  health: 'healthy' | 'watch' | 'risk'
  id: string
  name: string
  openTickets: number
  outstandingBalance: number
  region: string
}

export interface DemoActivityItem {
  detail: string
  id: string
  kind: 'ai' | 'manual' | 'system'
  time: string
  title: string
}

export interface DemoMetric {
  label: string
  tone?: 'good' | 'warn' | 'danger'
  value: string
}

export type DemoRouteId = 'commerce' | 'inventory' | 'invoices' | 'support'

export interface DemoProofPoint {
  label: string
  value: string
}

export interface DemoRouteStory {
  buyerTakeaway: string
  description: string
  expectedToolCall: string
  guideCommand: string
  id: DemoRouteId
  navLabel: string
  path: string
  placeholder: string
  proofDescription: string
  proofPoints: DemoProofPoint[]
  proofTitle: string
  safety: string
  suggestions: string[]
  title: string
}

export interface DemoConfirmationRequest {
  approve: () => void
  deny: () => void
  input: unknown
  reason: string
  toolName: string
}

export interface DemoShellProps {
  activityItems?: DemoActivityItem[]
  confirmationsEnabled?: boolean
  description?: string
  eyebrow: string
  getContext: () => unknown
  metrics?: DemoMetric[]
  placeholder: string
  proofDescription?: string
  proofPoints?: DemoProofPoint[]
  proofTitle?: string
  registeredToolsCount: number
  suggestions?: string[]
  title: string
}

export interface LatestPlanSummary {
  detail: string
  input: string
  status: 'blocked' | 'idle' | 'success'
  title: string
}

export interface PlannerModelOption {
  id: string
  label: string
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
}
