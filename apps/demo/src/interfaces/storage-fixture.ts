import type { PiLimits, PiSnapshot, PiTurnOutcome } from '@vampaz/webmcp-kit/pi'

export interface StorageFixture {
  open(label: string, owner: string, conversation: string, limits?: PiLimits): Promise<PiSnapshot>
  send(label: string, text: string): Promise<PiTurnOutcome>
  stop(label: string): Promise<void>
  clear(label: string): Promise<void>
  destroy(label: string): Promise<void>
  snapshot(label: string): PiSnapshot
  evidence(): Promise<boolean[]>
  evict(owner: string, conversation: string): Promise<void>
  unavailable(): Promise<PiSnapshot>
}

declare global {
  interface Window {
    piStorageFixture: StorageFixture
  }
}
