<template>
  <DemoShell
    :confirmations-enabled="settings.confirmationsEnabled"
    :eyebrow="`${cart.length} cart lines`"
    :get-context="getPlannerContext"
    :registered-tools-count="registeredToolsCount"
    title="Commerce"
  >
    <section class="demo-page-content demo-page-content--commerce">
      <DemoCartEditor
        v-model:discount-percent="cartDiscountPercent"
        v-model:quantity="cartQuantity"
        v-model:selected-product-id="selectedProductId"
        :cart="cart"
        :products="products"
        :total="cartTotal"
        @add-product="addSelectedProductToCart"
        @checkout="checkoutCartFromUi"
        @remove-line="removeCartLine"
        @update-line="updateCartLineQuantity"
      />
    </section>
  </DemoShell>
</template>

<script setup lang="ts">
import { defineTool, invokeTool, listTools, registerTool } from '@webmcp-kit/core'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import DemoCartEditor from '@/components/DemoCartEditor.vue'
import DemoShell from '@/components/DemoShell.vue'
import type { CartLine, Product } from '@/interfaces/demo'
import { getInitialDemoSettings, getInitialProducts } from '@/utils/demo-data'

const products = ref<Product[]>(getInitialProducts())
const cart = ref<CartLine[]>([])
const selectedProductId = ref(products.value[0]?.id ?? '')
const cartQuantity = ref(1)
const cartDiscountPercent = ref(0)
const settings = ref(getInitialDemoSettings())
const registeredToolsCount = ref(0)
const unregisterCallbacks: Array<() => void> = []
const cartTotal = computed(function getCartTotal() {
  const subtotal = cart.value.reduce(function sumCart(total, line) {
    return total + line.price * line.quantity
  }, 0)
  return Math.round(subtotal * (1 - cartDiscountPercent.value / 100))
})

onMounted(function handleMounted() {
  registerCommerceTools()
  refreshTools()
})

onUnmounted(function handleUnmounted() {
  for (const unregister of unregisterCallbacks) {
    unregister()
  }
})

function registerCommerceTools() {
  unregisterCallbacks.push(registerTool(defineTool({
    name: 'search_products',
    description: 'Search the local product catalog and return matching products for the current shopper.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search words for product name or category.'
        }
      },
      required: ['query'],
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: true
    },
    execute(input) {
      const query = String(input.query ?? '').toLowerCase()
      const tokens = getSearchTokens(query)
      const matches = products.value.filter(function filterProduct(product) {
        const searchableText = `${product.name} ${product.category}`.toLowerCase()
        return tokens.some(function hasToken(token) {
          return searchableText.includes(token)
        })
      })
      return matches
    }
  })).unregister)

  unregisterCallbacks.push(registerTool(defineTool({
    name: 'add_to_cart',
    description: 'Add a known product to the cart for the current shopping session.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'The product ID to add.'
        },
        quantity: {
          type: 'number',
          minimum: 1,
          description: 'How many units to add.'
        }
      },
      required: ['productId', 'quantity'],
      additionalProperties: false
    },
    guard(input) {
      return products.value.some(function hasProduct(item) {
        return item.id === String(input.productId ?? '')
      }) || 'Product is not available in the current catalog.'
    },
    execute(input) {
      addProductToCart(String(input.productId ?? ''), Number(input.quantity ?? 1))
      const line = cart.value.find(function findLine(item) {
        return item.productId === String(input.productId ?? '')
      })
      return line
    }
  })).unregister)

  unregisterCallbacks.push(registerTool(defineTool({
    name: 'update_cart_quantity',
    description: 'Update the quantity for an existing cart line.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string'
        },
        quantity: {
          type: 'number',
          minimum: 1
        }
      },
      required: ['productId', 'quantity'],
      additionalProperties: false
    },
    guard(input) {
      return cart.value.some(function hasLine(line) {
        return line.productId === String(input.productId ?? '')
      }) || 'Cart line does not exist.'
    },
    execute(input) {
      updateCartLineQuantity(String(input.productId), Number(input.quantity ?? 1))
      return cart.value
    }
  })).unregister)

  unregisterCallbacks.push(registerTool(defineTool({
    name: 'remove_from_cart',
    description: 'Remove a product line from the visible cart.',
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string'
        }
      },
      required: ['productId'],
      additionalProperties: false
    },
    confirmation: {
      required: true,
      reason: 'Removing a cart line changes the current order.'
    },
    execute(input) {
      removeCartLine(String(input.productId ?? ''))
      return cart.value
    }
  })).unregister)

  unregisterCallbacks.push(registerTool(defineTool({
    name: 'apply_cart_discount',
    description: 'Set the cart discount percentage control.',
    inputSchema: {
      type: 'object',
      properties: {
        percent: {
          type: 'number',
          minimum: 0,
          maximum: 100
        }
      },
      required: ['percent'],
      additionalProperties: false
    },
    execute(input) {
      cartDiscountPercent.value = Math.max(0, Math.min(100, Number(input.percent ?? 0)))
      return {
        discountPercent: cartDiscountPercent.value,
        total: cartTotal.value
      }
    }
  })).unregister)

  unregisterCallbacks.push(registerTool(defineTool({
    name: 'checkout_cart',
    description: 'Checkout the current cart and clear all cart lines after explicit confirmation.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false
    },
    confirmation: {
      required: true,
      reason: 'Checkout clears the cart and represents a purchase action.'
    },
    guard() {
      return cart.value.length > 0 || 'Cart is empty.'
    },
    execute() {
      const lines = [...cart.value]
      const total = cartTotal.value
      cart.value = []
      return {
        lines,
        total
      }
    }
  })).unregister)
}

function addSelectedProductToCart() {
  addProductToCart(selectedProductId.value, cartQuantity.value)
}

function addProductToCart(productId: string, quantity: number) {
  const product = products.value.find(function findProduct(item) {
    return item.id === productId
  })
  if (!product) return

  cart.value = [
    {
      productId: product.id,
      name: product.name,
      quantity,
      price: product.price
    },
    ...cart.value.filter(function removeExisting(existing) {
      return existing.productId !== product.id
    })
  ]
}

function updateCartLineQuantity(productId: string, quantity: number) {
  cart.value = cart.value.map(function mapLine(line) {
    if (line.productId !== productId) return line
    return {
      ...line,
      quantity: Math.max(1, quantity)
    }
  })
}

function removeCartLine(productId: string) {
  cart.value = cart.value.filter(function keepLine(line) {
    return line.productId !== productId
  })
}

async function checkoutCartFromUi() {
  await invokeTool({
    toolName: 'checkout_cart',
    input: {}
  })
}

function refreshTools() {
  registeredToolsCount.value = listTools().length
}

function getPlannerContext() {
  return {
    cart: cart.value,
    products: products.value,
    settings: settings.value
  }
}

function getSearchTokens(query: string): string[] {
  const tokens = query
    .split(/\W+/)
    .filter(function keepSearchToken(token) {
      return token.length > 2 && !['find', 'for', 'the', 'products', 'product'].includes(token)
    })

  return tokens.length > 0 ? tokens : [query]
}
</script>

<style scoped>
.demo-page-content {
  display: grid;
  min-width: 0;
  gap: clamp(0.9rem, 1.6vw, 1.25rem);
}

.demo-page-content--commerce {
  grid-template-columns: minmax(0, 1fr);
}
</style>
