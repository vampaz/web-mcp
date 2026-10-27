import type { ToolResolver } from '@vampaz/webmcp-kit'
import { createPiHarness, type PiController } from '@vampaz/webmcp-kit/pi'

let currentHarness: PiController | undefined

export async function stopDemoHarness() {
  await currentHarness?.stop()
}

export async function openDemoHarness(
  mode: string,
  getValue: () => number,
  resolver: ToolResolver,
  fixtures = false
): Promise<PiController> {
  const harness = await createPiHarness({
    session: {
      namespace: fixtures ? 'webmcp-kit-test-lab' : 'webmcp-kit-live-lab',
      ownerId: 'local-developer',
      conversationId: mode
    },
    resolver,
    context() {
      return { counter: getValue() }
    }
  })
  currentHarness = harness
  return harness
}
