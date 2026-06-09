<template>
  <section class="cart-editor">
    <div class="panel-heading">
      <h2>Cart workspace</h2>
    </div>

    <div class="product-grid" aria-label="Product catalog">
      <article
        v-for="product in products"
        :key="product.id"
        class="product-card"
        :class="{ 'product-card--active': product.id === selectedProductId }"
      >
        <img class="product-card__image" :alt="product.name" :src="getProductImage(product.id)" />
        <div class="product-card__meta">
          <span>{{ product.category }}</span>
          <strong>{{ product.sku }}</strong>
        </div>
        <div class="product-card__body">
          <h3>{{ product.name }}</h3>
          <p>{{ getProductStockLabel(product.id) }}</p>
        </div>
        <div class="product-card__commerce">
          <strong>€{{ product.price }}</strong>
          <span v-if="getCartLineQuantity(product.id) > 0">
            {{ getCartLineQuantity(product.id) }} in cart
          </span>
        </div>
        <div class="product-card__actions">
          <label>
            Qty
            <input
              :aria-label="`Quantity for ${product.name}`"
              :disabled="getProductRemainingAvailability(product.id) <= 0"
              :max="Math.max(1, getProductRemainingAvailability(product.id))"
              :value="getProductQuantityDraft(product.id)"
              type="number"
              min="1"
              @input="updateProductQuantity(product.id, $event)"
            />
          </label>
          <button
            type="button"
            :aria-label="`Add ${product.name} to cart`"
            :disabled="getProductRemainingAvailability(product.id) <= 0"
            @click="addProduct(product.id)"
          >
            Add
          </button>
        </div>
      </article>
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
import { ref } from 'vue'

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
const productImageSvgs: Record<string, string> = {
  'kbd-01': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 260" role="img"><rect width="420" height="260" fill="#f6f0e8"/><path d="M58 86h304v92H58z" fill="#fffaf1" stroke="#111" stroke-width="6"/><path d="M78 106h264v42H78z" fill="#2c5cff"/><g fill="#fffaf1"><rect x="92" y="116" width="18" height="12"/><rect x="122" y="116" width="18" height="12"/><rect x="152" y="116" width="18" height="12"/><rect x="182" y="116" width="18" height="12"/><rect x="212" y="116" width="18" height="12"/><rect x="242" y="116" width="18" height="12"/><rect x="272" y="116" width="18" height="12"/><rect x="302" y="116" width="18" height="12"/><rect x="92" y="136" width="138" height="12"/><rect x="242" y="136" width="78" height="12"/></g><path d="M108 194h204" stroke="#111" stroke-width="6" stroke-linecap="square"/></svg>`,
  'dock-02': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 260" role="img"><rect width="420" height="260" fill="#f6f0e8"/><rect x="98" y="78" width="224" height="112" rx="10" fill="#fffaf1" stroke="#111" stroke-width="6"/><rect x="126" y="112" width="48" height="28" fill="#2c5cff"/><rect x="194" y="112" width="48" height="28" fill="#111"/><rect x="262" y="112" width="34" height="28" fill="#2c5cff"/><path d="M210 190v28m0 0h-56m56 0h56" stroke="#111" stroke-width="6" stroke-linecap="square"/><circle cx="154" cy="218" r="12" fill="#2c5cff"/><circle cx="266" cy="218" r="12" fill="#2c5cff"/></svg>`,
  'cam-03': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 260" role="img"><rect width="420" height="260" fill="#f6f0e8"/><rect x="118" y="68" width="184" height="116" rx="12" fill="#fffaf1" stroke="#111" stroke-width="6"/><circle cx="210" cy="126" r="42" fill="#2c5cff" stroke="#111" stroke-width="6"/><circle cx="210" cy="126" r="18" fill="#fffaf1"/><rect x="170" y="44" width="80" height="28" fill="#111"/><path d="M180 184h40l22 34H158z" fill="#111"/><path d="M132 98h38" stroke="#2c5cff" stroke-width="10"/></svg>`,
  'mic-04': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 260" role="img"><rect width="420" height="260" fill="#f6f0e8"/><rect x="166" y="42" width="88" height="132" rx="44" fill="#fffaf1" stroke="#111" stroke-width="6"/><path d="M182 74h64M182 102h64M182 130h64" stroke="#2c5cff" stroke-width="8"/><path d="M134 126c0 58 76 58 76 58s76 0 76-58" fill="none" stroke="#111" stroke-width="6"/><path d="M210 184v38m-52 0h104" stroke="#111" stroke-width="6" stroke-linecap="square"/></svg>`,
  'stand-05': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 260" role="img"><rect width="420" height="260" fill="#f6f0e8"/><rect x="246" y="48" width="82" height="62" fill="#fffaf1" stroke="#111" stroke-width="6"/><path d="M100 198h130l56-136" stroke="#111" stroke-width="14" stroke-linecap="square"/><path d="M142 198h128" stroke="#2c5cff" stroke-width="10" stroke-linecap="square"/><circle cx="230" cy="198" r="18" fill="#fffaf1" stroke="#111" stroke-width="6"/><circle cx="286" cy="62" r="16" fill="#2c5cff"/></svg>`,
  'hub-06': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 260" role="img"><rect width="420" height="260" fill="#f6f0e8"/><rect x="118" y="76" width="184" height="108" rx="16" fill="#fffaf1" stroke="#111" stroke-width="6"/><circle cx="178" cy="130" r="24" fill="#2c5cff"/><circle cx="242" cy="130" r="24" fill="#111"/><path d="M210 76V42m0 0h86M210 184v34m0 0h-86" stroke="#111" stroke-width="6" stroke-linecap="square"/><circle cx="296" cy="42" r="14" fill="#2c5cff"/><circle cx="124" cy="218" r="14" fill="#2c5cff"/></svg>`
}
const productImages: Record<string, string> = {
  'kbd-01': createProductImage('kbd-01'),
  'dock-02': createProductImage('dock-02'),
  'cam-03': createProductImage('cam-03'),
  'mic-04': createProductImage('mic-04'),
  'stand-05': createProductImage('stand-05'),
  'hub-06': createProductImage('hub-06')
}
const quantityDrafts = ref<Record<string, number>>({})

function addProduct(productId: string) {
  const remainingQuantity = getProductRemainingAvailability(productId)
  const draftQuantity = getProductQuantityDraft(productId)
  const nextQuantity = Math.min(remainingQuantity > 0 ? remainingQuantity : 1, draftQuantity)
  emit('update:selected-product-id', productId)
  emit('update:quantity', nextQuantity)
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

function getProductQuantityDraft(productId: string): number {
  return (
    quantityDrafts.value[productId] ?? (productId === props.selectedProductId ? props.quantity : 1)
  )
}

function getProductImage(productId: string): string {
  return productImages[productId] ?? productImages['kbd-01']
}

function getCartLineQuantity(productId: string): number {
  return (
    props.cart.find(function findLine(line) {
      return line.productId === productId
    })?.quantity ?? 0
  )
}

function getProductStockLabel(productId: string): string {
  const remainingQuantity = getProductRemainingAvailability(productId)
  if (remainingQuantity === 0) return 'Fully allocated to the cart'
  if (remainingQuantity <= 5) return `${remainingQuantity} left in stock`
  return `${remainingQuantity} available`
}

function updateDiscount(event: Event) {
  emit('update:discount-percent', Number(getInputValue(event)))
}

function updateLine(productId: string, event: Event) {
  emit('update-line', productId, Number(getInputValue(event)))
}

function updateProductQuantity(productId: string, event: Event) {
  const remainingQuantity = getProductRemainingAvailability(productId)
  const nextQuantity = Math.min(
    remainingQuantity > 0 ? remainingQuantity : 1,
    Math.max(1, Math.floor(Number(getInputValue(event)) || 1))
  )
  quantityDrafts.value = {
    ...quantityDrafts.value,
    [productId]: nextQuantity
  }
  if (productId === props.selectedProductId) {
    emit('update:quantity', nextQuantity)
  }
}

function getInputValue(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : ''
}

function createProductImage(productId: string): string {
  return `data:image/svg+xml,${encodeURIComponent(productImageSvgs[productId] ?? productImageSvgs['kbd-01'])}`
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

.product-grid,
.cart-footer,
.cart-line {
  display: grid;
  gap: 8px;
}

.product-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
  gap: clamp(0.75rem, 1.5vw, 1rem);
}

.product-card {
  display: grid;
  min-width: 0;
  min-block-size: 100%;
  gap: clamp(0.8rem, 1.3vw, 1rem);
  padding: clamp(0.8rem, 1.5vw, 1rem);
  border: 1px solid var(--demo-rule-strong);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--demo-blue) 8%, transparent), transparent 38%),
    var(--demo-paper);
}

.product-card__image {
  display: block;
  width: 100%;
  max-width: 14rem;
  aspect-ratio: 4 / 3;
  border: 1px solid var(--demo-rule-strong);
  background: var(--demo-paper);
  object-fit: cover;
  justify-self: center;
}

.product-card--active {
  border-color: var(--demo-blue);
  box-shadow: inset 0 0 0 1px var(--demo-blue);
}

.product-card__meta,
.product-card__commerce {
  display: flex;
  gap: 0.65rem;
  align-items: center;
  justify-content: space-between;
}

.product-card__meta {
  color: var(--demo-muted);
  font-size: 0.76rem;
  font-weight: 800;
  text-transform: uppercase;
}

.product-card__meta strong {
  color: var(--demo-blue);
}

.product-card__body {
  display: grid;
  gap: 0.35rem;
}

.product-card__body h3 {
  margin: 0;
  color: var(--demo-ink);
  font-size: clamp(1.1rem, 1.45vw, 1.36rem);
  line-height: 1;
}

.product-card__body p {
  margin: 0;
  color: var(--demo-muted);
}

.product-card__commerce {
  align-items: end;
  margin-top: auto;
}

.product-card__commerce strong {
  color: var(--demo-ink);
  font-size: clamp(1.45rem, 2vw, 1.9rem);
  line-height: 0.95;
}

.product-card__commerce span {
  color: var(--demo-blue);
  font-size: 0.86rem;
  font-weight: 800;
  text-align: right;
}

.product-card__actions {
  display: grid;
  grid-template-columns: minmax(5.25rem, 0.45fr) auto;
  gap: 8px;
  align-items: end;
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
  font-size: 1rem;
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
  .cart-footer,
  .cart-line {
    grid-template-columns: 1fr;
  }

  .product-card__actions {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  input,
  button {
    min-block-size: 2.5rem;
  }
}
</style>
