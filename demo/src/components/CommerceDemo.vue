<template>
  <DemoShell
    :activity-items="activityItems"
    :confirmations-enabled="settings.confirmationsEnabled"
    :eyebrow="`${cart.length} cart lines`"
    :get-context="getPlannerContext"
    :metrics="metrics"
    placeholder="Try: Add two keyboard kits to the cart"
    :registered-tools-count="registeredToolsCount"
    description="Simulate assisted ordering with catalog search, stock-aware cart edits, discount controls, purchase confirmation, and receipt feedback."
    :suggestions="[
      'Add two keyboard kits to the cart',
      'Apply a 10 percent discount',
      'Checkout the current cart'
    ]"
    title="Commerce"
  >
    <section class="demo-page-content demo-page-content--commerce">
      <DemoCartEditor
        :cart="cart"
        :discount-percent="cartDiscountPercent"
        :products="products"
        :selected-product-id="selectedProductId"
        :quantity="cartQuantity"
        :total="cartTotal"
        @add-product="addSelectedProductToCart"
        @checkout="checkoutCartFromUi"
        @remove-line="removeCartLine"
        @update:discount-percent="updateCartDiscount"
        @update:quantity="updateCartQuantityDraft"
        @update:selected-product-id="updateSelectedProduct"
        @update-line="updateCartLineQuantity"
      />
    </section>
  </DemoShell>
</template>

<script setup lang="ts">
import { defineTool, invokeTool, listTools, registerTool } from 'webmcp-kit'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import DemoCartEditor from '@/components/DemoCartEditor.vue'
import DemoShell from '@/components/DemoShell.vue'
import type { CartLine, DemoActivityItem, DemoMetric, Product } from '@/interfaces/demo'
import { getInitialDemoSettings, getInitialProducts } from '@/utils/demo-data'

const products = ref<Product[]>(getInitialProducts())
const cart = ref<CartLine[]>([])
const selectedProductId = ref(products.value[0]?.id ?? '')
const cartQuantity = ref(1)
const cartDiscountPercent = ref(0)
const lastReceipt = ref('')
const settings = ref(getInitialDemoSettings())
const registeredToolsCount = ref(0)
const activityItems = ref<DemoActivityItem[]>([
  {
    id: 'commerce-seed',
    kind: 'system',
    time: '09:04',
    title: 'Catalog synced',
    detail: 'Catalog records include availability, SKU, pricing, and category context.'
  }
])
const unregisterCallbacks: Array<() => void> = []
const cartTotal = computed(function getCartTotal() {
  const subtotal = cart.value.reduce(function sumCart(total, line) {
    return total + line.price * line.quantity
  }, 0)
  return Math.round(subtotal * (1 - cartDiscountPercent.value / 100))
})
const metrics = computed<DemoMetric[]>(function getCommerceMetrics() {
  const units = cart.value.reduce(function sumUnits(total, line) {
    return total + line.quantity
  }, 0)
  const lowStockProducts = products.value.filter(function filterLowStock(product) {
    return product.available <= 5
  }).length

  return [
    {
      label: 'Cart total',
      value: `€${cartTotal.value}`,
      tone: cartTotal.value > 0 ? 'good' : undefined
    },
    {
      label: 'Units',
      value: String(units)
    },
    {
      label: 'Low stock',
      value: String(lowStockProducts),
      tone: lowStockProducts > 0 ? 'warn' : 'good'
    }
  ]
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
  unregisterCallbacks.push(
    registerTool(
      defineTool({
        name: 'search_products',
        description:
          'Search the local product catalog and return matching products for the current shopper.',
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
            const searchableText =
              `${product.name} ${product.category} ${product.sku}`.toLowerCase()
            return tokens.some(function hasToken(token) {
              return searchableText.includes(token)
            })
          })
          addActivity('ai', 'Catalog searched', `${matches.length} products matched "${query}".`)
          return matches
        }
      })
    ).unregister
  )

  unregisterCallbacks.push(
    registerTool(
      defineTool({
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
              type: 'integer',
              minimum: 1,
              description: 'How many units to add.'
            }
          },
          required: ['productId', 'quantity'],
          additionalProperties: false
        },
        guard(input) {
          const product = products.value.find(function hasProduct(item) {
            return item.id === String(input.productId ?? '')
          })
          if (!product) return 'Product is not available in the current catalog.'
          const requestedQuantity = normalizeCartQuantity(Number(input.quantity ?? 1))
          const currentQuantity = getCartLineQuantity(product.id)
          return (
            currentQuantity + requestedQuantity <= product.available ||
            'Requested quantity exceeds available stock.'
          )
        },
        execute(input) {
          const line = addProductToCart(String(input.productId ?? ''), Number(input.quantity ?? 1))
          if (line) {
            addActivity('ai', 'Cart line added', `${line.name} quantity is now ${line.quantity}.`)
          }
          return line
        }
      })
    ).unregister
  )

  unregisterCallbacks.push(
    registerTool(
      defineTool({
        name: 'update_cart_quantity',
        description: 'Update the quantity for an existing cart line.',
        inputSchema: {
          type: 'object',
          properties: {
            productId: {
              type: 'string'
            },
            quantity: {
              type: 'integer',
              minimum: 1
            }
          },
          required: ['productId', 'quantity'],
          additionalProperties: false
        },
        guard(input) {
          const productId = String(input.productId ?? '')
          const lineExists = cart.value.some(function hasLine(line) {
            return line.productId === productId
          })
          if (!lineExists) return 'Cart line does not exist.'
          const product = products.value.find(function hasProduct(item) {
            return item.id === productId
          })
          if (!product) return 'Product is not available in the current catalog.'
          return (
            normalizeCartQuantity(Number(input.quantity ?? 1)) <= product.available ||
            'Requested quantity exceeds available stock.'
          )
        },
        execute(input) {
          updateCartLineQuantity(String(input.productId), Number(input.quantity ?? 1), 'ai')
          return cart.value
        }
      })
    ).unregister
  )

  unregisterCallbacks.push(
    registerTool(
      defineTool({
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
          removeCartLine(String(input.productId ?? ''), 'ai')
          return cart.value
        }
      })
    ).unregister
  )

  unregisterCallbacks.push(
    registerTool(
      defineTool({
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
          addActivity('ai', 'Discount applied', `${cartDiscountPercent.value}% discount applied.`)
          return {
            discountPercent: cartDiscountPercent.value,
            total: cartTotal.value
          }
        }
      })
    ).unregister
  )

  unregisterCallbacks.push(
    registerTool(
      defineTool({
        name: 'checkout_cart',
        description:
          'Checkout the current cart and clear all cart lines after explicit confirmation.',
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
          lastReceipt.value = `ORD-${Date.now()}`
          cart.value = []
          addActivity('ai', 'Checkout completed', `${lastReceipt.value} captured for €${total}.`)
          return {
            lines,
            receiptId: lastReceipt.value,
            total
          }
        }
      })
    ).unregister
  )
}

function addSelectedProductToCart() {
  const previousQuantity = getCartLineQuantity(selectedProductId.value)
  const line = addProductToCart(selectedProductId.value, cartQuantity.value)
  if (line && line.quantity > previousQuantity) {
    addActivity('manual', 'Cart line added', `${line.name} quantity is now ${line.quantity}.`)
  }
}

function updateCartQuantityDraft(quantity: number) {
  const remainingQuantity = getRemainingProductQuantity(selectedProductId.value)
  cartQuantity.value = Math.min(
    remainingQuantity > 0 ? remainingQuantity : 1,
    normalizeCartQuantity(quantity)
  )
}

function updateCartDiscount(percent: number) {
  cartDiscountPercent.value = Math.max(
    0,
    Math.min(100, Math.floor(Number.isFinite(percent) ? percent : 0))
  )
}

function updateSelectedProduct(productId: string) {
  selectedProductId.value = productId
  updateCartQuantityDraft(cartQuantity.value)
}

function addProductToCart(productId: string, quantity: number): CartLine | undefined {
  const product = products.value.find(function findProduct(item) {
    return item.id === productId
  })
  if (!product) return undefined

  const nextQuantity = Math.min(
    product.available,
    getCartLineQuantity(product.id) + normalizeCartQuantity(quantity)
  )

  cart.value = [
    {
      productId: product.id,
      name: product.name,
      quantity: nextQuantity,
      price: product.price
    },
    ...cart.value.filter(function removeExisting(existing) {
      return existing.productId !== product.id
    })
  ]

  return cart.value.find(function findLine(line) {
    return line.productId === product.id
  })
}

function updateCartLineQuantity(
  productId: string,
  quantity: number,
  kind: DemoActivityItem['kind'] = 'manual'
) {
  let updatedLine: CartLine | undefined
  cart.value = cart.value.map(function mapLine(line) {
    if (line.productId !== productId) return line
    const product = products.value.find(function findProduct(item) {
      return item.id === productId
    })
    const nextQuantity = Math.min(
      product?.available ?? normalizeCartQuantity(quantity),
      normalizeCartQuantity(quantity)
    )
    updatedLine = {
      ...line,
      quantity: nextQuantity
    }
    return {
      ...line,
      quantity: nextQuantity
    }
  })
  if (updatedLine) {
    addActivity(
      kind,
      'Cart quantity updated',
      `${updatedLine.name} quantity set to ${updatedLine.quantity}.`
    )
  }
}

function removeCartLine(productId: string, kind: DemoActivityItem['kind'] = 'manual') {
  const removedLine = cart.value.find(function findLine(line) {
    return line.productId === productId
  })
  cart.value = cart.value.filter(function keepLine(line) {
    return line.productId !== productId
  })
  if (removedLine) {
    addActivity(kind, 'Cart line removed', `${removedLine.name} removed from cart.`)
  }
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
    lastReceipt: lastReceipt.value,
    products: products.value,
    settings: settings.value
  }
}

function getSearchTokens(query: string): string[] {
  const tokens = query.split(/\W+/).filter(function keepSearchToken(token) {
    return token.length > 2 && !['find', 'for', 'the', 'products', 'product'].includes(token)
  })

  return tokens.length > 0 ? tokens : [query]
}

function getCartLineQuantity(productId: string): number {
  return (
    cart.value.find(function findLine(line) {
      return line.productId === productId
    })?.quantity ?? 0
  )
}

function getRemainingProductQuantity(productId: string): number {
  const product = products.value.find(function findProduct(item) {
    return item.id === productId
  })
  return Math.max(0, (product?.available ?? 0) - getCartLineQuantity(productId))
}

function normalizeCartQuantity(quantity: number): number {
  return Math.max(1, Math.floor(Number.isFinite(quantity) ? quantity : 1))
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
  ].slice(0, 7)
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
