import type {
  CommandEvent,
  CommandResolverEvent,
  CommandResolverState,
  CommandState
} from './interfaces/command-state'

export function transitionCommand(state: CommandState, event: CommandEvent): CommandState {
  switch (event.type) {
    case 'start':
      return 'controller' in state ? state : { kind: 'preparing', controller: event.controller }
    case 'progress':
      if (
        (state.kind === 'preparing' && event.phase === 'resolving') ||
        (state.kind === 'resolving' && event.phase === 'executing')
      )
        return { kind: event.phase, controller: state.controller }
      return state
    case 'cancel':
      return 'controller' in state && state.kind !== 'stopping' && state.kind !== 'settling'
        ? { kind: 'stopping', controller: state.controller, phase: state.kind }
        : state
    case 'settle':
      return 'controller' in state
        ? { kind: 'settling', phase: event.phase, controller: state.controller }
        : state
    case 'release':
      return state.kind === 'settling' ? { kind: state.phase } : state
  }
}

export function transitionCommandResolver(
  state: CommandResolverState,
  event: CommandResolverEvent
): CommandResolverState {
  switch (event.type) {
    case 'create':
      return state.kind === 'empty'
        ? { kind: 'creating', revision: state.revision, promise: event.promise }
        : state
    case 'resolve':
      return state.kind === 'creating' && state.revision === event.revision
        ? { kind: 'ready', revision: state.revision, resolver: event.resolver }
        : state
    case 'reject':
      return state.kind === 'creating' && state.promise === event.promise
        ? { kind: 'empty', revision: state.revision }
        : state
    case 'invalidate':
      return { kind: 'empty', revision: state.revision + 1 }
  }
}
