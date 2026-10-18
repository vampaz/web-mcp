import type { PiController, PiRuntimeOptions } from './interfaces/controller'

export async function createPiRuntime(options: PiRuntimeOptions): Promise<PiController> {
  const { openRuntime } = await import('./runtime-engine')
  return openRuntime(options)
}
