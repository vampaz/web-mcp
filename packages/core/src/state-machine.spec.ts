import { expect, it, vi } from 'vitest'
import { createStateMachine } from './state-machine'

it('enforces rejected transitions and publishes the next state before a reentrant action', function actions() {
  const machine = createStateMachine<'idle' | 'running' | 'closed', 'start' | 'close'>(
    'idle',
    function transition(state, event) {
      if (event === 'close') return state === 'closed' ? state : 'closed'
      return state === 'idle' ? 'running' : state
    }
  )
  const rejected = vi.fn()
  machine.send('start', function started() {
    expect(machine.state).toBe('running')
    expect(machine.send('start', rejected)).toBe(false)
    machine.send('close')
  })
  expect(machine.state).toBe('closed')
  expect(machine.send('start', rejected)).toBe(false)
  expect(machine.act('start', rejected)).toEqual({ accepted: false })
  expect(rejected).not.toHaveBeenCalled()
})

it('returns an accepted action result without delaying the action', function result() {
  const machine = createStateMachine<'idle' | 'running', 'start'>(
    'idle',
    function transition(state) {
      return state === 'idle' ? 'running' : state
    }
  )
  const pending = Promise.resolve('done')
  const action = vi.fn(function start() {
    return pending
  })
  expect(machine.act('start', action)).toEqual({ accepted: true, value: pending })
  expect(action).toHaveBeenCalledOnce()
})
