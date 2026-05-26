<template>
  <DemoShell
    :activity-items="activityItems"
    :confirmations-enabled="settings.confirmationsEnabled"
    :eyebrow="`${selectableItems.length} selectable items`"
    :get-context="getPlannerContext"
    :metrics="metrics"
    placeholder="Try: Select all French items"
    :registered-tools-count="registeredToolsCount"
    description="Curate sellable stock from a live merchandising context: stock, aisle, supplier, margin, and demand all travel with each selectable item."
    :suggestions="[
      'Select all French items',
      'Select all high demand bakery items',
      'Clear the current selection'
    ]"
    title="Inventory"
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
import { defineTool, listTools, registerTool } from 'webmcp-kit'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import DemoSemanticInventory from '@/components/DemoSemanticInventory.vue'
import DemoShell from '@/components/DemoShell.vue'
import type { DemoActivityItem, DemoMetric, SelectableItem } from '@/interfaces/demo'
import { getInitialDemoSettings, getInitialSelectableItems } from '@/utils/demo-data'

const selectableItems = ref<SelectableItem[]>(getInitialSelectableItems())
const settings = ref(getInitialDemoSettings())
const registeredToolsCount = ref(0)
const activityItems = ref<DemoActivityItem[]>([
  {
    id: 'inventory-seed',
    kind: 'system',
    time: '09:12',
    title: 'Morning stock sync',
    detail: '72 items loaded with aisle, margin, demand, and supplier metadata.'
  }
])
const unregisterCallbacks: Array<() => void> = []
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

onMounted(function handleMounted() {
  registerInventoryTools()
  refreshTools()
})

onUnmounted(function handleUnmounted() {
  for (const unregister of unregisterCallbacks) {
    unregister()
  }
})

function registerInventoryTools() {
  unregisterCallbacks.push(
    registerTool(
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
    ).unregister
  )

  unregisterCallbacks.push(
    registerTool(
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
    ).unregister
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

function refreshTools() {
  registeredToolsCount.value = listTools().length
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

function addActivity(kind: DemoActivityItem['kind'], title: string, detail: string) {
  activityItems.value = [
    {
      id: `${Date.now()}-${activityItems.value.length}`,
      kind,
      time: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      }),
      title,
      detail
    },
    ...activityItems.value
  ].slice(0, 6)
}
</script>
