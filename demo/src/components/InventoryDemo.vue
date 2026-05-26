<template>
  <DemoShell
    :confirmations-enabled="settings.confirmationsEnabled"
    :eyebrow="`${selectableItems.length} selectable items`"
    :get-context="getPlannerContext"
    placeholder="Try: Select all French items"
    :registered-tools-count="registeredToolsCount"
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
import type { SelectableItem } from '@/interfaces/demo'
import { getInitialDemoSettings, getInitialSelectableItems } from '@/utils/demo-data'

const selectableItems = ref<SelectableItem[]>(getInitialSelectableItems())
const settings = ref(getInitialDemoSettings())
const registeredToolsCount = ref(0)
const unregisterCallbacks: Array<() => void> = []
const selectedItems = computed(function getSelectedItems() {
  return selectableItems.value.filter(function filterSelectedItem(item) {
    return item.selected
  })
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
}

function selectAllItems() {
  selectableItems.value = selectableItems.value.map(function mapItem(item) {
    return {
      ...item,
      selected: true
    }
  })
}

function clearItemSelection() {
  selectableItems.value = selectableItems.value.map(function mapItem(item) {
    return {
      ...item,
      selected: false
    }
  })
}

function refreshTools() {
  registeredToolsCount.value = listTools().length
}

function getPlannerContext() {
  return {
    checklistItems: selectableItems.value.map(function mapChecklistItem(item, index) {
      return {
        id: item.id,
        name: item.name,
        position: index + 1,
        selected: item.selected
      }
    }),
    settings: settings.value
  }
}
</script>
