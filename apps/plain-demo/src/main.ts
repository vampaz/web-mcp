import { defineTool, getSupportLabel, installWebMCPKitTestBridge, registerTool } from '@webmcp-kit/core'
import { mountDevtoolsOverlay } from '@webmcp-kit/devtools'

interface Product {
  id: string
  name: string
  category: string
}

interface CartLine {
  productId: string
  quantity: number
}

const products: Product[] = [
  { id: 'kbd-01', name: 'Low-profile keyboard', category: 'Input' },
  { id: 'dock-01', name: 'Travel USB-C dock', category: 'Connectivity' },
  { id: 'cam-01', name: 'Desk camera', category: 'Video' }
]
const cart: CartLine[] = []

const supportStatus = document.querySelector<HTMLElement>('[data-support-status]')
const productList = document.querySelector<HTMLUListElement>('[data-products]')
const cartList = document.querySelector<HTMLUListElement>('[data-cart]')
const searchForm = document.querySelector<HTMLFormElement>('[data-search-form]')

if (supportStatus) {
  supportStatus.textContent = getSupportLabel()
}

registerTool(defineTool({
  name: 'search_products',
  description: 'Search the local product catalog and return products matching the shopper request.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Product name or category to search for.'
      }
    },
    required: ['query'],
    additionalProperties: false
  },
  execute(input) {
    return searchProducts(String(input.query ?? ''))
  }
}))

registerTool(defineTool({
  name: 'add_to_cart',
  description: 'Add a product from the local catalog to the current shopper cart.',
  inputSchema: {
    type: 'object',
    properties: {
      productId: {
        type: 'string',
        description: 'Product ID from the catalog.'
      },
      quantity: {
        type: 'integer',
        minimum: 1,
        description: 'Quantity to add.'
      }
    },
    required: ['productId', 'quantity'],
    additionalProperties: false
  },
  execute(input) {
    const productId = String(input.productId ?? '')
    const quantity = Number(input.quantity ?? 1)
    addToCart(productId, quantity)
    render()

    return {
      cart
    }
  }
}))

installWebMCPKitTestBridge()
mountDevtoolsOverlay({ initiallyOpen: true })

searchForm?.addEventListener('submit', function handleSubmit(event) {
  event.preventDefault()
  const formData = new FormData(searchForm)
  render(String(formData.get('query') ?? ''))
})

render()

function searchProducts(query: string): Product[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return products

  return products.filter(function filterProduct(product) {
    return product.name.toLowerCase().includes(normalizedQuery) || product.category.toLowerCase().includes(normalizedQuery)
  })
}

function addToCart(productId: string, quantity: number): void {
  const existingLine = cart.find(function findLine(line) {
    return line.productId === productId
  })

  if (existingLine) {
    existingLine.quantity += quantity
    return
  }

  cart.push({
    productId,
    quantity
  })
}

function render(query = ''): void {
  if (productList) {
    productList.innerHTML = searchProducts(query).map(function renderProduct(product) {
      return `<li>${escapeHtml(product.name)} <small>${escapeHtml(product.category)}</small></li>`
    }).join('')
  }

  if (cartList) {
    cartList.innerHTML = cart.length === 0
      ? '<li>No cart lines yet.</li>'
      : cart.map(function renderCartLine(line) {
        const product = products.find(function findProduct(item) {
          return item.id === line.productId
        })
        return `<li>${escapeHtml(product?.name ?? line.productId)} x ${line.quantity}</li>`
      }).join('')
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
