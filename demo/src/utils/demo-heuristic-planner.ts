import {
  createHeuristicPlanner,
  type PlannerContext,
  type ToolPlan,
  type ToolPlanner,
  type WebMCPTool
} from 'webmcp-kit'

const ignoredSelectionTerms = new Set([
  'all',
  'and',
  'are',
  'for',
  'item',
  'items',
  'one',
  'ones',
  'select',
  'that',
  'the',
  'those',
  'with'
])

export function createDemoHeuristicPlanner(): ToolPlanner {
  const corePlanner = createHeuristicPlanner()

  return {
    ...corePlanner,
    name: 'Demo heuristic planner',
    async plan(message: string, tools: WebMCPTool[], context: PlannerContext = {}) {
      const demoPlan = planWithDemoHeuristics(message, tools, context)
      if (demoPlan) return demoPlan

      return corePlanner.plan(message, tools, context)
    }
  }
}

export function planWithDemoHeuristics(
  message: string,
  tools: WebMCPTool[],
  context: PlannerContext = {}
): ToolPlan | undefined {
  const selectionPlan = createSemanticSelectionPlan(message, tools, context)
  if (selectionPlan) return selectionPlan

  const invoicePlan = createInvoiceStatusPlan(message, tools, context)
  if (invoicePlan) return invoicePlan

  const invoiceCreationPlan = createInvoiceCreationPlan(message, tools)
  if (invoiceCreationPlan) return invoiceCreationPlan

  const supportPlan = createSupportTicketPlan(message, tools)
  if (supportPlan) return supportPlan

  return undefined
}

function createSemanticSelectionPlan(
  message: string,
  tools: WebMCPTool[],
  context: PlannerContext
): ToolPlan | undefined {
  const normalizedMessage = message.toLowerCase()
  if (!normalizedMessage.includes('select')) return undefined
  if (
    !tools.some(function hasSelectionTool(tool) {
      return tool.name === 'select_items'
    })
  )
    return undefined

  const ids = getSemanticContextItemIds(normalizedMessage, context)
  if (ids.length === 0) return undefined

  return {
    toolName: 'select_items',
    input: {
      ids
    },
    confidence: 0.64,
    reason: 'Matched visible checklist item metadata from the current demo context.'
  }
}

function createInvoiceStatusPlan(
  message: string,
  tools: WebMCPTool[],
  context: PlannerContext
): ToolPlan | undefined {
  const normalizedMessage = message.toLowerCase()
  if (!normalizedMessage.includes('invoice')) return undefined
  if (!normalizedMessage.includes('mark') && !normalizedMessage.includes('status')) return undefined
  if (
    !tools.some(function hasStatusTool(tool) {
      return tool.name === 'update_selected_invoice_status'
    })
  )
    return undefined

  const status = getInvoiceStatusFromMessage(normalizedMessage)
  const invoiceIds = getMatchingInvoiceIds(normalizedMessage, context)
  if (
    invoiceIds.length === 0 ||
    !tools.some(function hasSelectInvoicesTool(tool) {
      return tool.name === 'select_invoices'
    })
  ) {
    return {
      toolName: 'update_selected_invoice_status',
      input: {
        status
      },
      confidence: 0.68,
      reason: 'Matched invoice status mutation wording.'
    }
  }

  return {
    toolName: 'tool_sequence',
    input: {},
    confidence: 0.74,
    reason:
      'Matched invoice status mutation for specific invoice rows, so selected matching rows before updating status.',
    steps: [
      {
        toolName: 'select_invoices',
        input: {
          ids: invoiceIds
        },
        confidence: 0.74,
        reason: 'Selected invoice rows matching the user request.'
      },
      {
        toolName: 'update_selected_invoice_status',
        input: {
          status
        },
        confidence: 0.74,
        reason: 'Updated the selected invoice rows to the requested status.'
      }
    ]
  }
}

function createInvoiceCreationPlan(message: string, tools: WebMCPTool[]): ToolPlan | undefined {
  const normalizedMessage = message.toLowerCase()
  if (!normalizedMessage.includes('invoice')) return undefined
  if (!messageRequestsInvoiceCreation(normalizedMessage)) return undefined
  if (
    !tools.some(function hasCreateInvoiceTool(tool) {
      return tool.name === 'create_invoice'
    })
  )
    return undefined

  const amount = getInvoiceAmountFromMessage(message)
  const customerName = getInvoiceCustomerNameFromMessage(message)
  if (!amount || !customerName) return undefined

  return {
    toolName: 'create_invoice',
    input: {
      customerName,
      amount
    },
    confidence: 0.68,
    reason: 'Matched invoice creation wording and extracted the amount and customer.'
  }
}

function createSupportTicketPlan(message: string, tools: WebMCPTool[]): ToolPlan | undefined {
  const normalizedMessage = message.toLowerCase()
  if (!normalizedMessage.includes('support') && !normalizedMessage.includes('ticket')) {
    return undefined
  }
  if (!messageRequestsTicketCreation(normalizedMessage)) return undefined
  if (
    !tools.some(function hasSupportTool(tool) {
      return tool.name === 'create_support_ticket'
    })
  )
    return undefined

  return {
    toolName: 'create_support_ticket',
    input: {
      subject: 'Help request',
      body: message
    },
    confidence: 0.66,
    reason: 'Matched support-ticket wording.'
  }
}

function messageRequestsInvoiceCreation(normalizedMessage: string): boolean {
  return (
    normalizedMessage.includes('create') ||
    normalizedMessage.includes('draft') ||
    normalizedMessage.includes('new') ||
    normalizedMessage.includes('raise')
  )
}

function messageRequestsTicketCreation(normalizedMessage: string): boolean {
  return (
    normalizedMessage.includes('create') ||
    normalizedMessage.includes('file') ||
    normalizedMessage.includes('open') ||
    normalizedMessage.includes('new')
  )
}

function getInvoiceAmountFromMessage(message: string): number | undefined {
  const amountMatch = message.match(
    /(?:€\s*(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s*(?:€|euros?|eur\b|eu\b))/i
  )
  const amountText = amountMatch?.[1] ?? amountMatch?.[2]
  if (!amountText) return undefined

  const amount = Number(amountText.replace(',', '.'))
  return Number.isFinite(amount) && amount > 0 ? amount : undefined
}

function getInvoiceCustomerNameFromMessage(message: string): string | undefined {
  const customerMatch = message.match(
    /\b(?:for|to|bill)\s+([a-z][\w\s&.-]*?)(?:\s+(?:amount|due|for|on|owner|owned|with|worth)\b|$)/i
  )
  const customerName = customerMatch?.[1]?.replace(/[.,;:!?]+$/g, '').trim()
  if (!customerName) return undefined

  return customerName
    .split(/\s+/)
    .map(function titleCaseNamePart(part) {
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(' ')
}

function getSemanticContextItemIds(normalizedMessage: string, context: PlannerContext): string[] {
  const items = Array.isArray(context.checklistItems) ? context.checklistItems : []
  const terms = getChecklistSelectionTerms(normalizedMessage)
  if (terms.length === 0) return []

  return items
    .filter(function itemMatchesTerms(item) {
      const searchableText = getContextItemSearchableText(item)
      return terms.every(function hasTerm(term) {
        return termMatchesText(term, searchableText)
      })
    })
    .map(function mapItemId(item) {
      return getContextItemId(item)
    })
    .filter(function hasItemId(id): id is string {
      return Boolean(id)
    })
}

function getChecklistSelectionTerms(normalizedMessage: string): string[] {
  return normalizedMessage.split(/\W+/).filter(function keepChecklistTerm(term) {
    return term.length > 2 && !ignoredSelectionTerms.has(term)
  })
}

function getMatchingInvoiceIds(normalizedMessage: string, context: PlannerContext): string[] {
  const invoices = Array.isArray(context.invoices) ? context.invoices : []
  const terms = normalizedMessage.split(/\W+/).filter(function keepInvoiceTerm(term) {
    return term.length > 2 && !isIgnoredInvoiceTerm(term)
  })
  if (terms.length === 0) return []

  return invoices
    .filter(function invoiceMatches(invoice) {
      if (!invoice || typeof invoice !== 'object') return false
      const record = invoice as Record<string, unknown>
      const searchableText =
        `${record.customerName ?? ''} ${record.owner ?? ''} ${record.status ?? ''} ${record.id ?? ''}`.toLowerCase()
      return terms.every(function hasTerm(term) {
        return searchableText.includes(term)
      })
    })
    .map(function mapInvoiceId(invoice) {
      return getContextItemId(invoice)
    })
    .filter(function hasInvoiceId(id): id is string {
      return Boolean(id)
    })
}

function getInvoiceStatusFromMessage(normalizedMessage: string): string {
  if (normalizedMessage.includes('overdue')) return 'overdue'
  if (/\bpaid\b/.test(normalizedMessage)) return 'paid'
  if (normalizedMessage.includes('sent')) return 'sent'
  if (normalizedMessage.includes('draft')) return 'draft'
  if (normalizedMessage.includes('void')) return 'void'
  return 'paid'
}

function isIgnoredInvoiceTerm(term: string): boolean {
  return [
    'all',
    'are',
    'as',
    'draft',
    'invoice',
    'invoices',
    'mark',
    'overdue',
    'paid',
    'sent',
    'status',
    'the',
    'void'
  ].includes(term)
}

function getContextItemSearchableText(item: unknown): string {
  if (!item || typeof item !== 'object') return ''
  const record = item as Record<string, unknown>
  const name = record.name
  if (typeof name !== 'string') return ''

  return [name, ...getInferredChecklistTerms(name)].join(' ').toLowerCase()
}

function getInferredChecklistTerms(name: string): string[] {
  const normalizedName = name.toLowerCase()
  const terms: string[] = []

  if (['apple', 'banana', 'orange', 'lemon', 'grapefruit'].includes(normalizedName)) {
    terms.push('fruit')
  }

  if (['water', 'sparkling water', 'coffee', 'milk', 'tea'].includes(normalizedName)) {
    terms.push('liquid', 'liquids', 'drink', 'beverage')
  }

  if (['croissant', 'baguette', 'brie', 'pain au chocolat', 'quiche'].includes(normalizedName)) {
    terms.push('french')
  }

  if (['rice', 'almonds'].includes(normalizedName)) {
    terms.push('pantry')
  }

  if (['carrot', 'beetroot', 'potato', 'radish', 'turnip'].includes(normalizedName)) {
    terms.push('root', 'vegetable')
  }

  return terms
}

function termMatchesText(term: string, searchableText: string): boolean {
  if (searchableText.includes(term)) return true
  if (term.endsWith('s') && searchableText.includes(term.slice(0, -1))) return true
  return !term.endsWith('s') && searchableText.includes(`${term}s`)
}

function getContextItemId(item: unknown): string | undefined {
  if (!item || typeof item !== 'object' || !('id' in item)) return undefined

  const id = (item as { id: unknown }).id
  return typeof id === 'string' ? id : undefined
}
