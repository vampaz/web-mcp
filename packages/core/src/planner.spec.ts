import { afterEach, describe, expect, it } from 'vitest'

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
    ;(window as WindowWithLanguageModel).LanguageModel = {
      availability: async () => 'available',
      create: async () => ({
        prompt: async () => JSON.stringify({
          toolName: 'search_products',
          input: { query: 'dock' },
          confidence: 0.9,
          reason: 'Chrome chose product search.'
        })
      })
    }

    const planner = await createChromeAIPlanner()
    const plan = await planner.plan('Find docks', [])

    expect(planner.available).toBe(true)
    expect(planner.status).toBe('ready')
    expect(plan.toolName).toBe('search_products')
  })

  it('creates a direct heuristic planner', () => {
    const planner = createHeuristicPlanner()

    expect(planner.status).toBe('fallback')
    expect(planner.available).toBe(true)
  })
})
