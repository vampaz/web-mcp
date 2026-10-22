import type { PiController, PiHarnessOptions } from './interfaces/controller'
import { PiFailure } from './errors'
import { createPiRuntime } from './runtime'
import { createRegistryToolHost } from './tool-host'

export async function createPiHarness(options: PiHarnessOptions): Promise<PiController> {
  if (typeof window === 'undefined' || !window.isSecureContext)
    throw new PiFailure('unsupported', 'Pi needs a secure browser context.')

  let runtime: PiController | undefined
  let closed = false
  let suspension: Promise<void> | undefined
  let closing: Promise<void> | undefined

  async function stop() {
    const stopped = runtime?.stop()
    try {
      options.onCancel?.()
    } finally {
      await stopped
    }
  }

  function destroy(): Promise<void> {
    if (closing) return closing
    closed = true
    window.removeEventListener('pagehide', pagehide)
    closing = stop().finally(async function closeRuntime() {
      await runtime?.destroy()
    })
    return closing
  }

  function pagehide(event: PageTransitionEvent) {
    // A cached page can accept a new user turn when restored, but never resumes an old one.
    suspension = event.persisted ? stop() : destroy()
    void suspension.catch(function pageClosed() {})
  }

  window.addEventListener('pagehide', pagehide)
  try {
    runtime = await createPiRuntime({
      session: options.session,
      resolver: options.resolver,
      host: options.host ?? createRegistryToolHost(options.context),
      limits: options.limits
    })
    if (closed) {
      await runtime.destroy()
      throw new PiFailure('stale_document', 'The document closed while opening the conversation.')
    }
    const controller = runtime
    return {
      getSnapshot: controller.getSnapshot,
      subscribe: controller.subscribe,
      async send(text) {
        await suspension
        return controller.send(text)
      },
      async refresh() {
        await suspension
        return controller.refresh()
      },
      clear: controller.clear,
      stop,
      destroy
    }
  } catch (error) {
    window.removeEventListener('pagehide', pagehide)
    throw error
  }
}
