import type {
  Customer,
  DemoRouteId,
  DemoRouteStory,
  DemoSettings,
  Invoice,
  InvoiceDraft,
  PlannerModelOption,
  Product,
  SelectableItem,
  SupportTicket
} from '@/interfaces/demo'

const keyboardKitAvailable =
  getInitialProducts().find(function findKeyboardKit(product) {
    return product.id === 'kbd-01'
  })?.available ?? 18
const blockedKeyboardKitQuantity = keyboardKitAvailable + 2

const demoRouteStories: Record<DemoRouteId, DemoRouteStory> = {
  inventory: {
    id: 'inventory',
    path: '/',
    navLabel: 'Inventory',
    title: 'Inventory',
    description:
      'A planner reads the current merchandising table and can only call narrow selection and sorting tools owned by the app.',
    placeholder: 'Try: Select all French items',
    suggestions: [
      'Select all French items',
      'Sort inventory by lowest stock',
      'Clear the current selection'
    ],
    proofTitle: 'Context-scoped selection',
    proofDescription:
      'The command sees visible inventory metadata, returns stable item IDs, and updates the same checkboxes a user can control manually.',
    proofPoints: [
      {
        label: 'Planner context',
        value: 'Visible stock, aisle, supplier, demand, and margin only.'
      },
      {
        label: 'Callable tools',
        value: 'select_items, sort_inventory, clear_item_selection.'
      },
      {
        label: 'Safety boundary',
        value: 'The app owns IDs, schema validation, and table state.'
      }
    ],
    guideCommand: 'Select all French items',
    expectedToolCall: 'select_items({ ids: [...] })',
    safety: 'The planner cannot invent invoice, cart, or ticket actions on this route.',
    buyerTakeaway:
      'A SaaS page can expose useful AI actions without handing over global app control.'
  },
  invoices: {
    id: 'invoices',
    path: '/invoices/',
    navLabel: 'Invoices',
    title: 'Invoices',
    description:
      'A planner can chain account-receivable actions, but invoice mutations require explicit confirmation before records change.',
    placeholder: 'Try: Mark Stark Industries invoices as paid',
    suggestions: [
      'Open the Stark invoice',
      'Mark Stark Industries invoices as paid',
      'Show overdue invoices over 900 euros'
    ],
    proofTitle: 'Chained business mutation',
    proofDescription:
      'The Stark flow selects matching invoices, proposes a status update, and stops at a review dialog before changing business records.',
    proofPoints: [
      {
        label: 'Planner context',
        value: 'Visible invoice rows, customer health, owners, due dates, and risk.'
      },
      {
        label: 'Callable tools',
        value: 'select_invoices followed by update_selected_invoice_status.'
      },
      {
        label: 'Safety boundary',
        value: 'Paid-status changes require approval with exact validated input.'
      }
    ],
    guideCommand: 'Mark Stark Industries invoices as paid',
    expectedToolCall: 'select_invoices(...) -> update_selected_invoice_status({ status: "paid" })',
    safety: 'Confirmation is enforced per mutating tool, including inside chained plans.',
    buyerTakeaway:
      'Agentic workflows can be useful while still respecting approval gates for sensitive records.'
  },
  commerce: {
    id: 'commerce',
    path: '/commerce/',
    navLabel: 'Commerce',
    title: 'Commerce',
    description:
      'A planner can search products and edit a cart, while stock guards and checkout confirmation prevent unsafe purchases.',
    placeholder: 'Try: Add two keyboard kits to the cart',
    suggestions: [
      'Add two keyboard kits to the cart',
      'Apply a 10 percent discount',
      `Add ${blockedKeyboardKitQuantity} keyboard kits to the cart`
    ],
    proofTitle: 'Guarded purchase flow',
    proofDescription:
      'Cart tools validate product IDs and quantities before execution, and checkout cannot proceed without approval.',
    proofPoints: [
      {
        label: 'Planner context',
        value: 'Catalog records, availability, current cart lines, and discount.'
      },
      {
        label: 'Callable tools',
        value: 'search_products, add_to_cart, apply_cart_discount, checkout_cart.'
      },
      {
        label: 'Safety boundary',
        value: 'Stock guards block impossible quantities before execution.'
      }
    ],
    guideCommand: `Add ${blockedKeyboardKitQuantity} keyboard kits to the cart`,
    expectedToolCall: `add_to_cart({ productId: "kbd-01", quantity: ${blockedKeyboardKitQuantity} })`,
    safety: `The guard blocks the action because only ${keyboardKitAvailable} keyboard kits are available.`,
    buyerTakeaway: 'The demo shows blocked actions as a feature: app rules remain authoritative.'
  },
  support: {
    id: 'support',
    path: '/support/',
    navLabel: 'Support',
    title: 'Support',
    description:
      'A visible support form becomes a tool, and ticket updates stay constrained to the current board and schema.',
    placeholder: 'Try: Create a support ticket',
    suggestions: ['Create a support ticket', 'Open a support ticket', 'File a support ticket'],
    proofTitle: 'Form-backed operations',
    proofDescription:
      'The form registration turns existing fields into a create-ticket tool while board updates remain scoped to visible tickets.',
    proofPoints: [
      {
        label: 'Planner context',
        value: 'Form fields, account, ticket status, SLA age, priority, and assignee.'
      },
      {
        label: 'Callable tools',
        value: 'create_support_ticket and update_ticket.'
      },
      {
        label: 'Safety boundary',
        value: 'The update guard rejects tickets not visible in the current board.'
      }
    ],
    guideCommand: 'Create a support ticket',
    expectedToolCall: 'create_support_ticket({ subject, body })',
    safety: 'The app owns the form fields, validation, and created ticket record.',
    buyerTakeaway:
      'Teams can make ordinary forms and queues agent-callable without rebuilding the product.'
  }
}

export function getDemoRouteStory(id: DemoRouteId): DemoRouteStory {
  return demoRouteStories[id]
}

export function getDemoRouteStories(): DemoRouteStory[] {
  return [
    demoRouteStories.inventory,
    demoRouteStories.invoices,
    demoRouteStories.commerce,
    demoRouteStories.support
  ]
}

export function getCloudflareBindingModels(): PlannerModelOption[] {
  return [
    {
      id: '@cf/zai-org/glm-4.7-flash',
      label: 'GLM 4.7 Flash'
    },
    {
      id: '@cf/openai/gpt-oss-20b',
      label: 'GPT OSS 20B'
    },
    {
      id: '@cf/moonshotai/kimi-k2.6',
      label: 'Kimi K2.6'
    },
    {
      id: '@cf/qwen/qwen3-30b-a3b-fp8',
      label: 'Qwen3 30B A3B FP8'
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
      id: '@cf/nvidia/nemotron-3-120b-a12b',
      label: 'Nemotron 3 120B A12B'
    },
    {
      id: '@cf/google/gemma-4-26b-a4b-it',
      label: 'Gemma 4 26B A4B'
    }
  ]
}

export function getOpenRouterPlannerEndpoints(): PlannerModelOption[] {
  return [
    {
      id: 'nvidia/nemotron-3-super-120b-a12b:free',
      label: 'Nemotron 3 Super 120B A12B'
    },
    {
      id: 'nvidia/nemotron-nano-9b-v2:free',
      label: 'Nemotron Nano 9B V2'
    }
  ]
}

export function getOpenAIPlannerEndpoints(): PlannerModelOption[] {
  return [
    {
      id: 'gpt-5.4-mini',
      label: 'GPT-5.4 mini'
    }
  ]
}

export function getInitialCustomers(): Customer[] {
  return [
    {
      id: 'cust_globex',
      name: 'Globex',
      accountTier: 'enterprise',
      health: 'healthy',
      openTickets: 0,
      outstandingBalance: 230,
      region: 'EMEA'
    },
    {
      id: 'cust_northwind',
      name: 'Northwind',
      accountTier: 'growth',
      health: 'risk',
      openTickets: 2,
      outstandingBalance: 1420,
      region: 'North America'
    },
    {
      id: 'cust_aperture',
      name: 'Aperture Labs',
      accountTier: 'enterprise',
      health: 'watch',
      openTickets: 1,
      outstandingBalance: 1480,
      region: 'North America'
    },
    {
      id: 'cust_initech',
      name: 'Initech',
      accountTier: 'starter',
      health: 'healthy',
      openTickets: 0,
      outstandingBalance: 0,
      region: 'EMEA'
    },
    {
      id: 'cust_stark',
      name: 'Stark Industries',
      accountTier: 'enterprise',
      health: 'risk',
      openTickets: 3,
      outstandingBalance: 2310,
      region: 'North America'
    },
    {
      id: 'cust_umbrella',
      name: 'Umbrella Health',
      accountTier: 'growth',
      health: 'watch',
      openTickets: 1,
      outstandingBalance: 790,
      region: 'EMEA'
    }
  ]
}

export function getInitialInvoices(): Invoice[] {
  return [
    {
      id: 'inv_100',
      customerId: 'cust_globex',
      customerName: 'Globex',
      amount: 230,
      status: 'sent',
      dueDate: '2026-05-20',
      owner: 'Marta',
      risk: 'low',
      selected: false
    },
    {
      id: 'inv_101',
      customerId: 'cust_northwind',
      customerName: 'Northwind',
      amount: 920,
      status: 'overdue',
      dueDate: '2026-05-05',
      owner: 'Carlos',
      risk: 'high',
      selected: false
    },
    {
      id: 'inv_102',
      customerId: 'cust_aperture',
      customerName: 'Aperture Labs',
      amount: 1480,
      status: 'draft',
      dueDate: '2026-05-28',
      owner: 'Sofia',
      risk: 'medium',
      selected: false
    },
    {
      id: 'inv_103',
      customerId: 'cust_initech',
      customerName: 'Initech',
      amount: 640,
      status: 'paid',
      dueDate: '2026-05-11',
      owner: 'Rui',
      risk: 'low',
      selected: false
    },
    {
      id: 'inv_104',
      customerId: 'cust_stark',
      customerName: 'Stark Industries',
      amount: 2310,
      status: 'overdue',
      dueDate: '2026-05-02',
      owner: 'Carlos',
      risk: 'high',
      selected: false
    },
    {
      id: 'inv_105',
      customerId: 'cust_umbrella',
      customerName: 'Umbrella Health',
      amount: 790,
      status: 'sent',
      dueDate: '2026-05-23',
      owner: 'Marta',
      risk: 'medium',
      selected: false
    },
    {
      id: 'inv_106',
      customerId: 'cust_soylent',
      customerName: 'Soylent Systems',
      amount: 510,
      status: 'draft',
      dueDate: '2026-06-01',
      owner: 'Sofia',
      risk: 'low',
      selected: false
    },
    {
      id: 'inv_107',
      customerId: 'cust_wayne',
      customerName: 'Wayne Logistics',
      amount: 1750,
      status: 'sent',
      dueDate: '2026-05-18',
      owner: 'Rui',
      risk: 'medium',
      selected: false
    }
  ]
}

export function getInitialSelectableItems(): SelectableItem[] {
  const names = [
    { id: 'item_1', name: 'Apple', selected: false },
    { id: 'item_2', name: 'Banana', selected: false },
    { id: 'item_3', name: 'Carrot', selected: false },
    { id: 'item_4', name: 'Croissant', selected: false },
    { id: 'item_5', name: 'Orange', selected: false },
    { id: 'item_6', name: 'Spinach', selected: false },
    { id: 'item_7', name: 'Baguette', selected: false },
    { id: 'item_8', name: 'Water', selected: false },
    { id: 'item_9', name: 'Beetroot', selected: false },
    { id: 'item_10', name: 'Coffee', selected: false },
    { id: 'item_11', name: 'Lemon', selected: false },
    { id: 'item_12', name: 'Potato', selected: false },
    { id: 'item_13', name: 'Brie', selected: false },
    { id: 'item_14', name: 'Milk', selected: false },
    { id: 'item_15', name: 'Almonds', selected: false },
    { id: 'item_16', name: 'Sparkling water', selected: false },
    { id: 'item_17', name: 'Radish', selected: false },
    { id: 'item_18', name: 'Pain au chocolat', selected: false },
    { id: 'item_19', name: 'Grapefruit', selected: false },
    { id: 'item_20', name: 'Tea', selected: false },
    { id: 'item_21', name: 'Yogurt', selected: false },
    { id: 'item_22', name: 'Quiche', selected: false },
    { id: 'item_23', name: 'Rice', selected: false },
    { id: 'item_24', name: 'Turnip', selected: false },
    { id: 'item_25', name: 'Pear', selected: false },
    { id: 'item_26', name: 'Peach', selected: false },
    { id: 'item_27', name: 'Mushrooms', selected: false },
    { id: 'item_28', name: 'Tomato', selected: false },
    { id: 'item_29', name: 'Cucumber', selected: false },
    { id: 'item_30', name: 'Zucchini', selected: false },
    { id: 'item_31', name: 'Onion', selected: false },
    { id: 'item_32', name: 'Garlic', selected: false },
    { id: 'item_33', name: 'Lentils', selected: false },
    { id: 'item_34', name: 'Chickpeas', selected: false },
    { id: 'item_35', name: 'Pasta', selected: false },
    { id: 'item_36', name: 'Couscous', selected: false },
    { id: 'item_37', name: 'Oats', selected: false },
    { id: 'item_38', name: 'Flour', selected: false },
    { id: 'item_39', name: 'Sugar', selected: false },
    { id: 'item_40', name: 'Olive oil', selected: false },
    { id: 'item_41', name: 'Butter', selected: false },
    { id: 'item_42', name: 'Eggs', selected: false },
    { id: 'item_43', name: 'Cheddar', selected: false },
    { id: 'item_44', name: 'Mozzarella', selected: false },
    { id: 'item_45', name: 'Camembert', selected: false },
    { id: 'item_46', name: 'Goat cheese', selected: false },
    { id: 'item_47', name: 'Ham', selected: false },
    { id: 'item_48', name: 'Chicken breast', selected: false },
    { id: 'item_49', name: 'Salmon', selected: false },
    { id: 'item_50', name: 'Tuna', selected: false },
    { id: 'item_51', name: 'Shrimp', selected: false },
    { id: 'item_52', name: 'Tofu', selected: false },
    { id: 'item_53', name: 'Tempeh', selected: false },
    { id: 'item_54', name: 'Avocado', selected: false },
    { id: 'item_55', name: 'Kale', selected: false },
    { id: 'item_56', name: 'Lettuce', selected: false },
    { id: 'item_57', name: 'Parsley', selected: false },
    { id: 'item_58', name: 'Basil', selected: false },
    { id: 'item_59', name: 'Rosemary', selected: false },
    { id: 'item_60', name: 'Thyme', selected: false },
    { id: 'item_61', name: 'Mustard', selected: false },
    { id: 'item_62', name: 'Mayonnaise', selected: false },
    { id: 'item_63', name: 'Tomato sauce', selected: false },
    { id: 'item_64', name: 'Soy sauce', selected: false },
    { id: 'item_65', name: 'Dark chocolate', selected: false },
    { id: 'item_66', name: 'Macarons', selected: false },
    { id: 'item_67', name: 'Madeleines', selected: false },
    { id: 'item_68', name: 'Sourdough', selected: false },
    { id: 'item_69', name: 'Pita bread', selected: false },
    { id: 'item_70', name: 'Granola', selected: false },
    { id: 'item_71', name: 'Honey', selected: false },
    { id: 'item_72', name: 'Jam', selected: false }
  ]

  return names.map(function mapInventoryItem(item, index) {
    const aisle = getInventoryAisle(item.name)
    return {
      ...item,
      aisle,
      demand: index % 9 === 0 ? 'high' : index % 7 === 0 ? 'low' : 'normal',
      margin: 12 + ((index * 7) % 31),
      stock: 18 + ((index * 13) % 92),
      supplier:
        index % 4 === 0
          ? 'Lisbon Fresh'
          : index % 4 === 1
            ? 'Nord Market'
            : index % 4 === 2
              ? 'Atelier Pantry'
              : 'Cascais Co-op'
    }
  })
}

export function getInitialProducts(): Product[] {
  return [
    {
      id: 'kbd-01',
      name: 'Low-profile keyboard',
      category: 'Input',
      price: 129,
      sku: 'KBD-LP-01',
      available: 18
    },
    {
      id: 'dock-02',
      name: 'Travel USB-C dock',
      category: 'Connectivity',
      price: 89,
      sku: 'DOCK-TR-02',
      available: 7
    },
    {
      id: 'cam-03',
      name: 'Desk camera',
      category: 'Video',
      price: 149,
      sku: 'CAM-HD-03',
      available: 11
    },
    {
      id: 'mic-04',
      name: 'Studio microphone',
      category: 'Audio',
      price: 179,
      sku: 'MIC-ST-04',
      available: 5
    },
    {
      id: 'stand-05',
      name: 'Monitor arm',
      category: 'Ergonomics',
      price: 119,
      sku: 'ARM-DS-05',
      available: 23
    },
    {
      id: 'hub-06',
      name: 'Conference hub',
      category: 'Meeting room',
      price: 329,
      sku: 'HUB-CF-06',
      available: 4
    }
  ]
}

export function getInitialTickets(): SupportTicket[] {
  return [
    {
      id: 'ticket_1',
      account: 'Northwind',
      ageHours: 18,
      subject: 'Billing access',
      body: 'Cannot open the latest invoice from the workspace.',
      status: 'new',
      priority: 'high',
      assignee: 'Unassigned'
    },
    {
      id: 'ticket_2',
      account: 'Globex',
      ageHours: 7,
      subject: 'Camera order',
      body: 'Customer asked for an updated delivery estimate.',
      status: 'triaged',
      priority: 'medium',
      assignee: 'Marta'
    },
    {
      id: 'ticket_3',
      account: 'Stark Industries',
      ageHours: 31,
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

function getInventoryAisle(name: string): string {
  const lowerName = name.toLowerCase()
  if (
    ['croissant', 'baguette', 'pain au chocolat', 'quiche', 'sourdough', 'pita bread'].some(
      function hasBakeryItem(item) {
        return lowerName.includes(item)
      }
    )
  ) {
    return 'Bakery'
  }
  if (
    [
      'brie',
      'milk',
      'yogurt',
      'cheddar',
      'mozzarella',
      'camembert',
      'goat cheese',
      'butter',
      'eggs'
    ].some(function hasDairyItem(item) {
      return lowerName.includes(item)
    })
  ) {
    return 'Dairy'
  }
  if (
    ['water', 'coffee', 'tea'].some(function hasDrinkItem(item) {
      return lowerName.includes(item)
    })
  ) {
    return 'Drinks'
  }
  if (
    ['ham', 'chicken', 'salmon', 'tuna', 'shrimp', 'tofu', 'tempeh'].some(
      function hasProteinItem(item) {
        return lowerName.includes(item)
      }
    )
  ) {
    return 'Protein'
  }
  if (
    ['chocolate', 'macarons', 'madeleines', 'honey', 'jam', 'sugar'].some(
      function hasTreatItem(item) {
        return lowerName.includes(item)
      }
    )
  ) {
    return 'Specialty'
  }
  return 'Produce'
}

export function getInitialDemoSettings(): DemoSettings {
  return {
    confirmationsEnabled: true,
    density: 'compact'
  }
}
