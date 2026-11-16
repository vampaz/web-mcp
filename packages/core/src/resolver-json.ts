import type { ToolResolution } from './interfaces/tool'
import { ToolResolutionValidationError } from './resolution-validation'

export function normalizeJsonText(value: string, source = 'AI'): string {
  const trimmedValue = value.trim()
  if (!trimmedValue) throw new ToolResolutionValidationError(`${source} returned empty text`)

  // Slice fences instead of matching them: an unterminated fence made the previous
  // regex backtrack quadratically over untrusted model text.
  if (trimmedValue.startsWith('```') && trimmedValue.endsWith('```') && trimmedValue.length >= 6) {
    let inner = trimmedValue.slice(3, -3)
    if (inner.slice(0, 4).toLowerCase() === 'json') inner = inner.slice(4)
    const fenced = inner.trim()
    if (fenced) return fenced
  }

  const firstBraceIndex = trimmedValue.indexOf('{')
  const lastBraceIndex = trimmedValue.lastIndexOf('}')
  if (firstBraceIndex !== -1 && lastBraceIndex > firstBraceIndex) {
    return trimmedValue.slice(firstBraceIndex, lastBraceIndex + 1)
  }

  throw new ToolResolutionValidationError(
    `${source} returned non-JSON text: ${trimmedValue.slice(0, 120)}`
  )
}

// Unusable model text is an invalid resolution, so callers such as Pi can ask the model again.
export function parseToolResolutionJson(value: string, source: string): ToolResolution {
  try {
    return JSON.parse(normalizeJsonText(value, source)) as ToolResolution
  } catch {
    throw new ToolResolutionValidationError(`${source} returned unparseable JSON`)
  }
}
