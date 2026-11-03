import { expect, it } from 'vitest'
import { transitionCatalog, transitionCorrection, transitionTurn } from './turn-state'

it('cannot accept actions after cancellation or settlement', function interrupted() {
  expect(transitionTurn('recovering', 'start')).toBe('accepting')
  for (const state of ['stopping', 'settled'] as const)
    expect(transitionTurn(state, 'start')).toBe(state)
  expect(transitionTurn('accepting', 'stop')).toBe('stopping')
  expect(transitionTurn('stopping', 'settle')).toBe('settled')
})

it('bounds corrections to one use and refreshes to one per model round', function budgets() {
  expect(transitionCorrection('available', 'correct')).toBe('used')
  expect(transitionCorrection('used', 'correct')).toBe('used')
  expect(transitionCatalog('current', 'refresh')).toBe('refreshed')
  expect(transitionCatalog('refreshed', 'refresh')).toBe('refreshed')
  expect(transitionCatalog('refreshed', 'resolve')).toBe('current')
})
