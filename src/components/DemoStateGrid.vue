<template>
  <section class="state-grid">
    <article class="state-panel">
      <h2>Invoices</h2>
      <div v-for="invoice in invoices" :key="invoice.id" class="state-row">
        <span>{{ invoice.customerName }}</span>
        <strong>€{{ invoice.amount }}</strong>
        <em>{{ invoice.status }}</em>
      </div>
    </article>

    <article class="state-panel">
      <h2>Products</h2>
      <div v-for="product in products" :key="product.id" class="state-row">
        <span>{{ product.name }}</span>
        <strong>€{{ product.price }}</strong>
        <em>{{ product.category }}</em>
      </div>
    </article>

    <article class="state-panel">
      <h2>Cart</h2>
      <div v-if="cart.length === 0" class="empty-state">No cart lines yet.</div>
      <div v-for="line in cart" :key="line.productId" class="state-row">
        <span>{{ line.name }}</span>
        <strong>{{ line.quantity }}x</strong>
        <em>€{{ line.price }}</em>
      </div>
    </article>

    <article class="state-panel">
      <h2>Tickets</h2>
      <div v-if="tickets.length === 0" class="empty-state">No support tickets yet.</div>
      <div v-for="ticket in tickets" :key="ticket.id" class="state-row">
        <span>{{ ticket.subject }}</span>
        <strong>{{ ticket.status }}</strong>
        <em>{{ ticket.body }}</em>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import type { CartLine, Invoice, Product, SupportTicket } from '@/interfaces/demo'

interface Props {
  cart: CartLine[]
  invoices: Invoice[]
  products: Product[]
  tickets: SupportTicket[]
}

withDefaults(defineProps<Props>(), {})
</script>

<style scoped>
.state-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.state-panel {
  padding: clamp(18px, 3vw, 28px);
  border: 1px solid rgba(244, 240, 232, 0.14);
  background: rgba(12, 17, 16, 0.72);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.26);
  backdrop-filter: blur(18px);
}

h2 {
  margin: 0 0 14px;
  font-size: clamp(1.05rem, 1.5vw, 1.32rem);
  letter-spacing: 0;
}

.state-row {
  display: grid;
  gap: 4px;
  padding: 12px 0;
  border-top: 1px solid rgba(244, 240, 232, 0.1);
}

.state-row em,
.empty-state {
  color: #9ea8a1;
}

.state-row em {
  font-style: normal;
}

@media (max-width: 980px) {
  .state-grid {
    grid-template-columns: 1fr;
  }
}
</style>
