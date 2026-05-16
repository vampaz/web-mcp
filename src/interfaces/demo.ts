export interface Invoice {
  id: string
  customerName: string
  amount: number
  status: 'draft' | 'sent' | 'void'
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
  status: 'open' | 'triaged'
}

export interface SelectableItem {
  id: string
  name: string
  selected: boolean
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
