import type { ToolInvocationErrorCode } from './interfaces/tool'

/** An application failure whose JSON details must reach the agent, including partial results. */
export class ToolExecutionError extends Error {
  constructor(
    readonly code: ToolInvocationErrorCode,
    message: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ToolExecutionError'
  }
}
