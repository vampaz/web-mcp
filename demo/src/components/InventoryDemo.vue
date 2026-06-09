<template>
  <DemoShell
    :activity-items="activityItems"
    :confirmations-enabled="settings.confirmationsEnabled"
    :eyebrow="`${selectableItems.length} selectable items`"
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
    <DemoSemanticInventory
      :items="selectableItems"
      :selected-count="selectedItems.length"
      @clear-selection="clearItemSelection"
      @select-all="selectAllItems"
      @toggle-item="setItemSelected"
    />
  </DemoShell>
</template>

<script setup lang="ts">
import { defineTool } from 'webmcp-kit'
import { computed, ref } from 'vue'

import DemoSemanticInventory from '@/components/DemoSemanticInventory.vue'
import DemoShell from '@/components/DemoShell.vue'
import { useDemoTools } from '@/composables/use-demo-tools'
import type { DemoMetric, SelectableItem } from '@/interfaces/demo'
import { getDemoRouteStory, getInitialSelectableItems } from '@/utils/demo-data'

type InventorySortKey = 'aisle' | 'demand' | 'margin' | 'name' | 'stock' | 'supplier'
type InventorySortDirection = 'asc' | 'desc'

const selectableItems = ref<SelectableItem[]>(getInitialSelectableItems())
const story = getDemoRouteStory('inventory')
const { activityItems, addActivity, registerDemoTool, registeredToolsCount, settings } =
  useDemoTools({
    maxActivityItems: 6,
    registerTools: registerInventoryTools,
    seedActivity: [
      {
        id: 'inventory-seed',
        kind: 'system',
        time: '09:12',
        title: 'Morning stock sync',
        detail: '72 items loaded with aisle, margin, demand, and supplier metadata.'
      }
    ]
  })
const selectedItems = computed(function getSelectedItems() {
  return selectableItems.value.filter(function filterSelectedItem(item) {
    return item.selected
  })
})
const metrics = computed<DemoMetric[]>(function getInventoryMetrics() {
  const highDemandCount = selectableItems.value.filter(function filterHighDemand(item) {
    return item.demand === 'high'
  }).length
  const averageMargin = Math.round(
    selectableItems.value.reduce(function sumMargin(total, item) {
      return total + item.margin
    }, 0) / selectableItems.value.length
  )
  const lowStockCount = selectableItems.value.filter(function filterLowStock(item) {
    return item.stock < 30
  }).length

  return [
    {
      label: 'Selected',
      value: String(selectedItems.value.length),
      tone: selectedItems.value.length > 0 ? 'good' : undefined
    },
    {
      label: 'High demand',
      value: String(highDemandCount),
      tone: 'warn'
    },
    {
      label: 'Avg margin',
      value: `${averageMargin}%`,
      tone: lowStockCount > 8 ? 'warn' : 'good'
    }
  ]
})

function registerInventoryTools() {
  registerDemoTool(
    defineTool({
      name: 'select_items',
      description: 'Select visible inventory items by stable item IDs.',
      inputSchema: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: {
              type: 'string'
            },
            description: 'Stable item IDs to select from the visible inventory.'
          }
        },
        required: ['ids'],
        additionalProperties: false
      },
      execute(input) {
        const ids = Array.isArray(input.ids) ? input.ids.map(String) : []
        selectableItems.value = selectableItems.value.map(function mapItem(item) {
          return {
            ...item,
            selected: ids.includes(item.id)
          }
        })
        addActivity(
          'ai',
          'Selection updated',
          `${selectedItems.value.length} inventory items selected from the current merchandising context.`
        )
        return selectedItems.value
      }
    })
  )

  registerDemoTool(
    defineTool({
      name: 'clear_item_selection',
      description: 'Clear the current semantic inventory selection.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false
      },
      execute() {
        clearItemSelection()
        addActivity('ai', 'Selection cleared', 'All merchandising selections were removed.')
        return []
      }
    })
  )

  registerDemoTool(
    defineTool({
      name: 'sort_inventory',
      description: 'Sort the visible inventory table by a supported column.',
      inputSchema: {
        type: 'object',
        properties: {
          sortBy: {
            type: 'string',
            enum: ['aisle', 'demand', 'margin', 'name', 'stock', 'supplier']
          },
          direction: {
            type: 'string',
            enum: ['asc', 'desc']
          }
        },
        required: ['sortBy'],
        additionalProperties: false
      },
      execute(input) {
        const sortBy = isInventorySortKey(input.sortBy) ? input.sortBy : 'name'
        const direction = input.direction === 'desc' ? 'desc' : 'asc'
        selectableItems.value = [...selectableItems.value].sort(function sortItems(left, right) {
          return compareInventoryItems(left, right, sortBy, direction)
        })
        addActivity('ai', 'Inventory table sorted', `Sorted by ${sortBy}.`)
        return selectableItems.value
      }
    })
  )
}

function setItemSelected(id: string, selected: boolean) {
  selectableItems.value = selectableItems.value.map(function mapItem(item) {
    if (item.id !== id) return item
    return {
      ...item,
      selected
    }
  })
  const item = selectableItems.value.find(function findItem(candidate) {
    return candidate.id === id
  })
  addActivity(
    'manual',
    selected ? 'Item selected' : 'Item cleared',
    item ? `${item.name} in ${item.aisle} was ${selected ? 'selected' : 'cleared'}.` : id
  )
}

function selectAllItems() {
  selectableItems.value = selectableItems.value.map(function mapItem(item) {
    return {
      ...item,
      selected: true
    }
  })
  addActivity(
    'manual',
    'All visible items selected',
    `${selectableItems.value.length} items selected.`
  )
}

function clearItemSelection() {
  selectableItems.value = selectableItems.value.map(function mapItem(item) {
    return {
      ...item,
      selected: false
    }
  })
  addActivity('manual', 'Selection cleared', 'All visible inventory selections were cleared.')
}

function compareInventoryItems(
  left: SelectableItem,
  right: SelectableItem,
  sortBy: InventorySortKey,
  direction: InventorySortDirection
): number {
  const multiplier = direction === 'asc' ? 1 : -1
  const comparison = compareInventorySortValues(
    getInventorySortValue(left, sortBy),
    getInventorySortValue(right, sortBy)
  )

  return comparison * multiplier
}

function compareInventorySortValues(left: number | string, right: number | string): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right

  return String(left).localeCompare(String(right))
}

function getInventorySortValue(item: SelectableItem, sortBy: InventorySortKey): number | string {
  if (sortBy === 'demand') return getInventoryDemandRank(item.demand)

  return item[sortBy]
}

function getInventoryDemandRank(demand: SelectableItem['demand']): number {
  if (demand === 'low') return 0
  if (demand === 'normal') return 1

  return 2
}

function isInventorySortKey(value: unknown): value is InventorySortKey {
  return (
    value === 'aisle' ||
    value === 'demand' ||
    value === 'margin' ||
    value === 'name' ||
    value === 'stock' ||
    value === 'supplier'
  )
}

function getPlannerContext() {
  return {
    checklistItems: selectableItems.value.map(function mapChecklistItem(item, index) {
      return {
        aisle: item.aisle,
        demand: item.demand,
        id: item.id,
        margin: item.margin,
        name: item.name,
        position: index + 1,
        selected: item.selected,
        stock: item.stock,
        supplier: item.supplier
      }
    }),
    settings: settings.value
  }
}
</script>
