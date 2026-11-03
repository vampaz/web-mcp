export interface StateTransition<TState, TEvent> {
  previous: TState
  state: TState
  event: TEvent
}

export type TransitionResult<T> = { accepted: false } | { accepted: true; value: T }

export interface StateMachine<TState, TEvent> {
  readonly state: TState
  act<T extends TEvent, R>(
    event: T,
    action: (transition: StateTransition<TState, T>) => R
  ): TransitionResult<R>
  send<T extends TEvent>(
    event: T,
    action?: (transition: StateTransition<TState, T>) => void
  ): boolean
}
