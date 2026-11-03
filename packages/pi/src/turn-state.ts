import type { CatalogState, CorrectionState, TurnEvent, TurnState } from './interfaces/turn-state'

export function transitionTurn(state: TurnState, event: TurnEvent): TurnState {
  switch (event) {
    case 'start':
      return state === 'recovering' ? 'accepting' : state
    case 'stop':
      return state === 'settled' ? state : 'stopping'
    case 'settle':
      return 'settled'
  }
}

export function transitionCorrection(state: CorrectionState, event: 'correct'): CorrectionState {
  return event === 'correct' && state === 'available' ? 'used' : state
}

export function transitionCatalog(state: CatalogState, event: 'refresh' | 'resolve'): CatalogState {
  return event === 'resolve' ? 'current' : state === 'current' ? 'refreshed' : state
}
