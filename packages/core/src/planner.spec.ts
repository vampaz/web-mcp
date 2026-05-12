import { afterEach, describe, expect, it, vi } from 'vitest'

import { createBestPlanner, createChromeAIPlanner, createHeuristicPlanner } from './planner'

interface WindowWithLanguageModel extends Window {
  LanguageModel?: {
    availability: () => Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'>
    create: () => Promise<{
      prompt: () => Promise<string>
    }>
  }
}

describe('planner', () => {
  afterEach(() => {
    delete (window as WindowWithLanguageModel).LanguageModel
  })

  it('uses a deterministic fallback planner without Chrome built-in AI', async () => {
    const planner = await createBestPlanner()
    const plan = await planner.plan('Create an invoice for Acme for 250 euros', [])

    expect(planner.status).toBe('fallback')
    expect(plan.toolName).toBe('create_invoice')
    expect(plan.input.amount).toBe(250)
  })

  it('reports Chrome AI downloadable status without using it as active planner', async () => {
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'downloadable',
      create: async () => ({
        prompt: async () => '{}'
      })
    }

    const planner = await createChromeAIPlanner()

    expect(planner.available).toBe(false)
    expect(planner.status).toBe('downloadable')
  })

  it('uses Chrome built-in AI when available', async () => {
    const create = vi.fn(async () => ({
      prompt: async () => JSON.stringify({
        toolName: 'search_products',
        input: { query: 'dock' },
        confidence: 0.9,
        reason: 'Chrome chose product search.'
      })
    }))
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'available',
      create
    }

    const planner = await createChromeAIPlanner()
    expect(create).not.toHaveBeenCalled()

    const plan = await planner.plan('Find docks', [])

    expect(planner.available).toBe(true)
    expect(planner.status).toBe('ready')
    expect(plan.toolName).toBe('search_products')
    expect(create).toHaveBeenCalledOnce()
  })

  it('falls back if Chrome AI session creation fails after user activation', async () => {
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'available',
      create: async () => {
        throw new Error('user activation required')
      }
    }

    const planner = await createChromeAIPlanner()
    const plan = await planner.plan('Add ten keyboards to the cart.', [])

    expect(planner.available).toBe(true)
    expect(plan.toolName).toBe('add_to_cart')
    expect(plan.input.quantity).toBe(10)
    expect(plan.reason).toContain('Used deterministic fallback')
  })

  it('creates a direct heuristic planner', () => {
    const planner = createHeuristicPlanner()

    expect(planner.status).toBe('fallback')
    expect(planner.available).toBe(true)
  })

  it('extracts word quantities for cart commands', async () => {
    const planner = createHeuristicPlanner()
    const plan = await planner.plan('Add ten keyboards to the card.', [])

    expect(plan.toolName).toBe('add_to_cart')
    expect(plan.input).toEqual({
      productId: 'kbd-01',
      quantity: 10
    })
  })

  it('extracts numeric quantities for cart commands', async () => {
    const planner = createHeuristicPlanner()
    const plan = await planner.plan('Add 12 docks to the cart.', [])

    expect(plan.toolName).toBe('add_to_cart')
    expect(plan.input).toEqual({
      productId: 'dock-02',
      quantity: 12
    })
  })

  it('plans positional checklist selection', async () => {
    const planner = createHeuristicPlanner()
    const plan = await planner.plan('Select the first five items', [])

    expect(plan.toolName).toBe('select_items_by_position')
    expect(plan.input).toEqual({
      start: 1,
      count: 5
    })
  })

  it('plans category checklist selection', async () => {
    const planner = createHeuristicPlanner()
    const plan = await planner.plan('Select all the items that are fruits', [])

    expect(plan.toolName).toBe('select_items_by_category')
    expect(plan.input).toEqual({
      category: 'fruit'
    })
  })

  it('plans checklist selection clearing', async () => {
    const planner = createHeuristicPlanner()
    const plan = await planner.plan('Clear the selection', [])

    expect(plan.toolName).toBe('clear_item_selection')
    expect(plan.input).toEqual({})
  })
})
