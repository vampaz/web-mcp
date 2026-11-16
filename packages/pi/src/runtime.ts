import type { PiController, PiRuntimeOptions } from './interfaces/controller'

/** Creates a Pi controller in the current browser context with an explicit tool host. */
export async function createPiRuntime(options: PiRuntimeOptions): Promise<PiController> {
  const { openRuntime } = await import('./runtime-engine')
  return openRuntime(options)
}
