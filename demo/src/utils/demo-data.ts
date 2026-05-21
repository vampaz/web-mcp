import type { DemoSettings, Invoice, InvoiceDraft, PlannerModelOption, Product, SelectableItem, SupportTicket } from '@/interfaces/demo'

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

export function getInitialSelectableItems(): SelectableItem[] {
  return [
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
}

export function getInitialProducts(): Product[] {
  return [
    { id: 'kbd-01', name: 'Low-profile keyboard', category: 'Input', price: 129 },
    { id: 'dock-02', name: 'Travel USB-C dock', category: 'Connectivity', price: 89 },
    { id: 'cam-03', name: 'Desk camera', category: 'Video', price: 149 }
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
    density: 'compact'
  }
}
