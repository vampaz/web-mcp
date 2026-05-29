<template>
  <section class="cart-editor">
    <div class="panel-heading">
      <h2>Cart workspace</h2>
    </div>

    <div class="product-picker">
      <label>
        Product
        <select :value="selectedProductId" @change="updateProduct">
          <option v-for="product in products" :key="product.id" :value="product.id">
            {{ product.name }} · {{ product.sku }} · {{ product.available }} in stock · €{{
              product.price
            }}
          </option>
        </select>
      </label>
      <label>
        Qty
        <input
          :disabled="getProductRemainingAvailability(selectedProductId) <= 0"
          :max="Math.max(1, getProductRemainingAvailability(selectedProductId))"
          :value="quantity"
          type="number"
          min="1"
          @input="updateQuantity"
        />
      </label>
      <button
        type="button"
        :disabled="getProductRemainingAvailability(selectedProductId) <= 0"
        @click="addProduct"
      >
        Add
      </button>
    </div>

    <div class="cart-lines">
      <div v-if="cart.length === 0" class="empty-state">
        No cart lines yet. Pending order is empty.
      </div>
      <div v-for="line in cart" :key="line.productId" class="cart-line">
        <span>{{ line.name }}</span>
        <input
          :max="getProductAvailability(line.productId)"
          :value="line.quantity"
          type="number"
          min="1"
          :aria-label="`Quantity for ${line.name}`"
          @input="updateLine(line.productId, $event)"
        />
        <strong>€{{ line.price * line.quantity }}</strong>
        <button type="button" @click="removeLine(line.productId)">Remove</button>
      </div>
    </div>

    <div class="cart-footer">
      <label>
        Discount %
        <input :value="discountPercent" type="number" min="0" max="100" @input="updateDiscount" />
      </label>
      <div class="cart-total">
        <span>Total</span>
        <strong>€{{ total }}</strong>
      </div>
      <button type="button" :disabled="cart.length === 0" @click="checkout">Checkout</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { CartLine, Product } from '@/interfaces/demo'

interface Props {
  cart: CartLine[]
  discountPercent: number
  products: Product[]
  quantity: number
  selectedProductId: string
  total: number
}

const props = withDefaults(defineProps<Props>(), {})
const emit = defineEmits<{
  'add-product': []
  checkout: []
  'remove-line': [productId: string]
  'update:discount-percent': [value: number]
  'update:quantity': [value: number]
  'update:selected-product-id': [value: string]
  'update-line': [productId: string, quantity: number]
}>()

function addProduct() {
  emit('add-product')
}

function checkout() {
  emit('checkout')
}

function removeLine(productId: string) {
  emit('remove-line', productId)
}

function getProductAvailability(productId: string): number | undefined {
  return props.products.find(function findProduct(product) {
    return product.id === productId
  })?.available
}

function getProductRemainingAvailability(productId: string): number {
  const available = getProductAvailability(productId) ?? 0
  const currentQuantity =
    props.cart.find(function findLine(line) {
      return line.productId === productId
    })?.quantity ?? 0
  return Math.max(0, available - currentQuantity)
}

function updateProduct(event: Event) {
  emit('update:selected-product-id', getInputValue(event))
}

function updateQuantity(event: Event) {
  emit('update:quantity', Number(getInputValue(event)))
}

function updateDiscount(event: Event) {
  emit('update:discount-percent', Number(getInputValue(event)))
}

function updateLine(productId: string, event: Event) {
  emit('update-line', productId, Number(getInputValue(event)))
}

function getInputValue(event: Event): string {
  return event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement
    ? event.target.value
    : ''
}
</script>

<style scoped>
.cart-editor {
  display: grid;
  gap: clamp(0.75rem, 1.5vw, 1rem);
  padding: clamp(0.9rem, 1.8vw, 1.25rem);
  border: 1px solid var(--demo-rule-strong);
  background: var(--demo-paper-wash);
}

.panel-heading {
  display: grid;
  gap: 8px;
  min-block-size: 2.35rem;
  align-items: center;
}

h2 {
  margin: 0;
  font-size: clamp(1.05rem, 1.5vw, 1.32rem);
}

.product-picker,
.cart-footer,
.cart-line {
  display: grid;
  gap: 8px;
  align-items: end;
}

.product-picker {
  grid-template-columns: minmax(min(100%, 24rem), 1fr) minmax(6rem, 0.18fr) auto;
}

.cart-line {
  grid-template-columns: minmax(0, 1fr) minmax(5.5ch, 0.16fr) auto auto;
  align-items: center;
  padding: 0.5rem 0;
  border-top: 1px solid var(--demo-rule);
}

label {
  display: grid;
  gap: 5px;
  color: var(--demo-muted);
  font-size: 0.88rem;
}

input,
select,
button {
  min-block-size: 2.38rem;
  border: 1px solid var(--demo-rule-strong);
  font: inherit;
}

input,
select {
  min-width: 0;
  padding: 0.5rem 0.62rem;
  background: var(--demo-paper);
  color: var(--demo-ink);
}

button {
  padding: 0.5rem 0.62rem;
  background: transparent;
  color: var(--demo-blue);
  white-space: nowrap;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.44;
}

.cart-footer {
  grid-template-columns: minmax(7rem, 9rem) minmax(0, 1fr) auto;
  align-items: end;
  padding-top: 0.75rem;
  border-top: 1px solid var(--demo-rule);
}

.product-picker label:first-child {
  min-width: 0;
}

.cart-total {
  display: grid;
  gap: 0.15rem;
  justify-self: start;
}

.cart-total strong {
  color: var(--demo-ink);
  font-size: 1.18rem;
}

.cart-footer span,
.empty-state {
  color: var(--demo-muted);
}

@media (max-width: 760px) {
  .product-picker,
  .cart-footer,
  .cart-line {
    grid-template-columns: 1fr;
  }

  input,
  select,
  button {
    min-block-size: 2.5rem;
  }
}
</style>
