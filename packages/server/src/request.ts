import type { ResolverProviderKind, ToolAnnotations } from '@vampaz/webmcp-kit'
import { raceAbort } from '../../core/src/abort'
import { validateJsonSchema } from '../../core/src/schema'
import type { ResolverEndpointRequest, ResolverEndpointTool } from './interfaces/handler'

const providerKinds: readonly ResolverProviderKind[] = [
  'auto',
  'chrome-built-in',
  'local',
  'openai',
  'openrouter',
  'openai-compatible',
  'cloudflare-binding'
]

const requestFields = [
  'provider',
  'model',
  'message',
  'tools',
  'context',
  'responseSchema',
  'singleStep',
  'purpose'
] as const

const toolFields = ['name', 'description', 'inputSchema', 'outputSchema', 'annotations'] as const

/** A rejected resolver request with the HTTP status the handler should return. */
export class ResolverRequestError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'ResolverRequestError'
    this.status = status
  }
}

export async function readResolverRequest(
  request: Request,
  maxBodyBytes: number
): Promise<ResolverEndpointRequest> {
  const bytes = await readBoundedBody(request, maxBodyBytes)
  let body: unknown
  try {
    body = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new ResolverRequestError('The request body must be valid JSON.')
  }
  return parseResolverPayload(body)
}

async function readBoundedBody(request: Request, maxBodyBytes: number): Promise<Uint8Array> {
  const signal = request.signal
  if (signal.aborted) throw cancelledRequest()
  if (!request.body) throw new ResolverRequestError('The request body is required.')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  function abort() {
    // A stalled stream may ignore cancellation; do not await it or the handler can hang.
    void reader.cancel().catch(function ignore() {})
  }
  signal.addEventListener('abort', abort, { once: true })
  try {
    while (true) {
      if (signal.aborted) throw cancelledRequest()
      const { done, value } = await raceAbort(reader.read(), signal, 'The request was cancelled.')
      if (signal.aborted) throw cancelledRequest()
      if (done) break
      total += value.byteLength
      if (total > maxBodyBytes) {
        // A stalled stream may never settle its cancel; do not await it or the 413 can hang.
        void reader.cancel().catch(function ignore() {})
        throw new ResolverRequestError('The request body is too large.', 413)
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof ResolverRequestError) throw error
    if (signal.aborted) throw cancelledRequest()
    throw new ResolverRequestError('The request body could not be read.')
  } finally {
    signal.removeEventListener('abort', abort)
    try {
      reader.releaseLock()
    } catch {
      // A cancelled stream may still have a pending read and remain locked.
    }
  }
  if (total === 0) throw new ResolverRequestError('The request body is required.')
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export function parseResolverPayload(value: unknown): ResolverEndpointRequest {
  if (!isRecord(value)) throw invalid()
  assertOnlyFields(value, requestFields)
  if (
    typeof value.provider !== 'string' ||
    !providerKinds.includes(value.provider as ResolverProviderKind)
  )
    throw invalid()
  if (!isNonEmptyString(value.model)) throw invalid()
  if (!isNonEmptyString(value.message)) throw invalid()
  if (!Array.isArray(value.tools)) throw invalid()
  const tools = value.tools.map(parseTool)
  if (new Set(tools.map((tool) => tool.name)).size !== tools.length) throw invalid()
  if (!isRecord(value.context)) throw invalid()
  if (!isRecord(value.responseSchema) || validateJsonSchema(value.responseSchema).length > 0)
    throw invalid()
  if (value.singleStep !== undefined && value.singleStep !== true) throw invalid()
  if (value.purpose !== undefined && value.purpose !== 'summary') throw invalid()

  return {
    provider: value.provider as ResolverProviderKind,
    model: value.model,
    message: value.message,
    tools,
    context: value.context,
    responseSchema: value.responseSchema,
    ...(value.singleStep === true ? { singleStep: true as const } : {}),
    ...(value.purpose === 'summary' ? { purpose: 'summary' as const } : {})
  }
}

function parseTool(value: unknown): ResolverEndpointTool {
  if (!isRecord(value)) throw invalid()
  assertOnlyFields(value, toolFields)
  if (!isNonEmptyString(value.name)) throw invalid()
  if (typeof value.description !== 'string') throw invalid()
  if (!isRecord(value.inputSchema) || validateJsonSchema(value.inputSchema).length > 0)
    throw invalid()
  if (value.outputSchema !== undefined) {
    if (!isRecord(value.outputSchema) || validateJsonSchema(value.outputSchema).length > 0)
      throw invalid()
  }
  const annotations =
    value.annotations === undefined ? undefined : parseAnnotations(value.annotations)
  return {
    name: value.name,
    description: value.description,
    inputSchema: value.inputSchema,
    ...(value.outputSchema ? { outputSchema: value.outputSchema } : {}),
    ...(annotations ? { annotations } : {})
  }
}

function parseAnnotations(value: unknown): ToolAnnotations {
  if (!isRecord(value)) throw invalid()
  if (value.readOnlyHint !== undefined && typeof value.readOnlyHint !== 'boolean') throw invalid()
  if (value.untrustedContentHint !== undefined && typeof value.untrustedContentHint !== 'boolean')
    throw invalid()
  return value as ToolAnnotations
}

function cancelledRequest(): ResolverRequestError {
  return new ResolverRequestError('The request was cancelled.', 499)
}

function assertOnlyFields(value: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw invalid()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function invalid(): ResolverRequestError {
  return new ResolverRequestError('The resolver request is invalid.')
}
