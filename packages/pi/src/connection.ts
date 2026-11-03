import { createStateMachine } from '../../core/src/state-machine'
import { createDeferred } from '../../core/src/deferred'
import type { PiController, PiHarnessOptions } from './interfaces/controller'
import type { ConnectionEvent, ConnectionState } from './interfaces/connection-state'
import { transitionConnection } from './connection-state'
import { PiFailure } from './errors'
import { createPiRuntime } from './runtime'
import { createRegistryToolHost } from './tool-host'

export async function createPiHarness(options: PiHarnessOptions): Promise<PiController> {
  if (typeof window === 'undefined' || !window.isSecureContext)
    throw new PiFailure('unsupported', 'Pi needs a secure browser context.')

  const initial: Extract<ConnectionState, { kind: 'opening' }> = {
    kind: 'opening',
    opening: createPiRuntime({
      session: options.session,
      resolver: options.resolver,
      host: options.host ?? createRegistryToolHost(options.context),
      limits: options.limits
    })
  }
  const lifecycle = createStateMachine<ConnectionState, ConnectionEvent>(
    initial,
    transitionConnection
  )

  async function cancel(state: ConnectionState) {
    const stopped =
      'runtime' in state
        ? state.runtime.stop()
        : 'opening' in state
          ? state.opening.then(function stop(runtime) {
              return runtime.stop()
            })
          : Promise.resolve()
    try {
      options.onCancel?.()
    } finally {
      await stopped
    }
  }

  async function stop() {
    const state = lifecycle.state
    if (state.kind === 'closed') return
    if (state.kind === 'closing') {
      await state.promise.catch(function settled() {})
      return
    }
    await cancel(state)
  }

  function destroy(): Promise<void> {
    const state = lifecycle.state
    if (state.kind === 'closing' || state.kind === 'closed') return state.promise
    const task = createDeferred<void>()
    lifecycle.send({ type: 'close', promise: task.promise }, function close({ previous }) {
      window.removeEventListener('pagehide', pagehide)
      task.resolve(
        cancel(previous).finally(async function closeRuntime() {
          try {
            if ('runtime' in previous) await previous.runtime.destroy()
            else if ('opening' in previous) await (await previous.opening).destroy()
          } finally {
            lifecycle.send({ type: 'closed' })
          }
        })
      )
    })
    return task.promise
  }

  function pagehide(event: PageTransitionEvent) {
    if (!event.persisted) {
      void destroy().catch(function pageClosed() {})
      return
    }
    const task = createDeferred<void>()
    lifecycle.send({ type: 'suspend', promise: task.promise }, function suspend({ previous }) {
      task.resolve(
        cancel(previous)
          .catch(function cancelled() {})
          .finally(function suspended() {
            lifecycle.send({ type: 'resume', promise: task.promise })
          })
      )
    })
  }

  window.addEventListener('pagehide', pagehide)
  try {
    const controller = await initial.opening
    if (!lifecycle.send({ type: 'opened', runtime: controller })) {
      await destroy().catch(function closed() {})
      throw new PiFailure('stale_document', 'The document closed while opening the conversation.')
    }
    return {
      getSnapshot: controller.getSnapshot,
      subscribe: controller.subscribe,
      async send(text) {
        while (lifecycle.state.kind === 'suspending') await lifecycle.state.promise
        const state = lifecycle.state
        if (state.kind !== 'active')
          return {
            status: 'error',
            error: { code: 'conversation_busy', message: 'This conversation has closed.' }
          }
        return state.runtime.send(text)
      },
      async refresh() {
        while (lifecycle.state.kind === 'suspending') await lifecycle.state.promise
        const state = lifecycle.state
        if (state.kind !== 'active')
          throw new PiFailure('conversation_busy', 'This conversation has closed.')
        return state.runtime.refresh()
      },
      async clear() {
        while (lifecycle.state.kind === 'suspending') await lifecycle.state.promise
        const state = lifecycle.state
        if (state.kind === 'closing' || state.kind === 'closed')
          throw new PiFailure('conversation_busy', 'This conversation has closed.')
        if (state.kind !== 'active')
          throw new PiFailure('conversation_busy', 'Stop the current turn before clearing chat.')
        return state.runtime.clear()
      },
      stop,
      destroy
    }
  } catch (error) {
    window.removeEventListener('pagehide', pagehide)
    throw error
  }
}
