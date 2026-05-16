<template>
  <section class="cart-editor">
    <div class="panel-heading">
      <p class="eyebrow">Line item controls</p>
      <h2>Cart editor</h2>
    </div>

    <div class="product-picker">
      <label>
        Product
        <select :value="selectedProductId" @change="updateProduct">
          <option v-for="product in products" :key="product.id" :value="product.id">
            {{ product.name }} · €{{ product.price }}
          </option>
        </select>
      </label>
      <label>
        Qty
        <input :value="quantity" type="number" min="1" @input="updateQuantity" />
      </label>
      <button type="button" @click="addProduct">Add</button>
    </div>

    <div class="cart-lines">
      <div v-if="cart.length === 0" class="empty-state">No cart lines yet.</div>
      <div v-for="line in cart" :key="line.productId" class="cart-line">
        <span>{{ line.name }}</span>
        <input :value="line.quantity" type="number" min="1" :aria-label="`Quantity for ${line.name}`" @input="updateLine(line.productId, $event)" />
        <strong>€{{ line.price * line.quantity }}</strong>
        <button type="button" @click="removeLine(line.productId)">Remove</button>
      </div>
    </div>

    <div class="cart-footer">
      <label>
        Discount %
        <input :value="discountPercent" type="number" min="0" max="100" @input="updateDiscount" />
      </label>
      <div>
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

withDefaults(defineProps<Props>(), {})
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
  gap: 14px;
  padding: clamp(18px, 3vw, 28px);
  border: 1px solid rgba(244, 240, 232, 0.14);
  background: rgba(12, 17, 16, 0.72);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.26);
  backdrop-filter: blur(18px);
}

.panel-heading {
  display: grid;
  gap: 8px;
}

.eyebrow {
  margin: 0;
  color: #e8be53;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  font-size: clamp(1.05rem, 1.5vw, 1.32rem);
}

.product-picker,
.cart-footer,
.cart-line {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 86px auto;
  gap: 8px;
  align-items: end;
}

.cart-line {
  grid-template-columns: minmax(0, 1fr) 76px auto auto;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid rgba(244, 240, 232, 0.1);
}

label {
  display: grid;
  gap: 5px;
  color: #c9d1cb;
  font-size: 0.88rem;
}

input,
select,
button {
  min-height: 38px;
  border: 1px solid rgba(244, 240, 232, 0.18);
  font: inherit;
}

input,
select {
  min-width: 0;
  padding: 8px 10px;
  background: #f4f0e8;
  color: #0c1110;
}

button {
  padding: 8px 10px;
  background: rgba(244, 240, 232, 0.06);
  color: #f4f0e8;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.44;
}

.cart-footer {
  grid-template-columns: 120px minmax(0, 1fr) auto;
  align-items: end;
}

.cart-footer span,
.empty-state {
  color: #9ea8a1;
}

@media (max-width: 760px) {
  .product-picker,
  .cart-footer,
  .cart-line {
    grid-template-columns: 1fr;
  }
}
</style>
