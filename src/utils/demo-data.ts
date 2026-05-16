import type { ActivityItem, Invoice, PlannerModelOption, Product, SelectableItem } from '@/interfaces/demo'

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
    { id: 'inv_100', customerName: 'Globex', amount: 230, status: 'sent' }
  ]
}

export function getInitialProducts(): Product[] {
  return [
    { id: 'kbd-01', name: 'Low-profile keyboard', category: 'Input', price: 129 },
    { id: 'dock-02', name: 'Travel USB-C dock', category: 'Connectivity', price: 89 },
    { id: 'cam-03', name: 'Desk camera', category: 'Video', price: 149 }
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
    { id: 'item_24', name: 'Turnip', selected: false }
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
