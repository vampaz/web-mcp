import type { StateMachine, StateTransition } from './interfaces/state-machine'

export function createStateMachine<TState, TEvent>(
  initial: TState,
  transition: (state: TState, event: TEvent) => TState
): StateMachine<TState, TEvent> {
  let state = initial
  return {
    get state() {
      return state
    },
    act<T extends TEvent, R>(event: T, action: (transition: StateTransition<TState, T>) => R) {
      const step = enter(event)
      return step ? { accepted: true as const, value: action(step) } : { accepted: false as const }
    },
    send<T extends TEvent>(event: T, action?: (transition: StateTransition<TState, T>) => void) {
      const step = enter(event)
      if (!step) return false
      action?.(step)
      return true
    }
  }

  function enter<T extends TEvent>(event: T): StateTransition<TState, T> | undefined {
    const previous = state
    const next = transition(previous, event)
    if (next === previous) return undefined
    state = next
    return { previous, state: next, event }
  }
}
