import type {
  Api,
  AssistantMessage,
  JsonObject,
  Model,
  StreamOptions,
  TranscriptContext
} from '@earendil-works/pi-ai'
import { createModels, createProvider } from '@earendil-works/pi-ai/models'
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream'
import { isContextOverflow } from '@earendil-works/pi-ai/utils/overflow'
import type { Message } from '@earendil-works/pi-ai'
import type { ToolResolution } from '@vampaz/webmcp-kit'
import { isContextOverflowError, piError } from './errors'

export const piModel = { provider: 'webmcp', modelId: 'configured-resolver' }

export interface PiRoundResult {
  resolution: ToolResolution
  /** UTF-8 bytes of the request actually sent, used as the measured context size. */
  requestBytes?: number
}

export function isPiContextOverflow(error: unknown) {
  if (isContextOverflowError(error)) return true
  const message = piAssistantMessage()
  message.stopReason = 'error'
  message.errorMessage = piError(error).message
  return isContextOverflow(message)
}

// Pi measures context from assistant usage; JSON is roughly four bytes per token.
function estimatedTokens(bytes: number) {
  return Math.ceil(bytes / 4)
}

function piAssistantMessage(): AssistantMessage {
  return {
    role: 'assistant',
    content: [],
    api: 'webmcp',
    provider: piModel.provider,
    model: piModel.modelId,
    stopReason: 'stop',
    timestamp: Date.now(),
    // ToolResolver does not expose usage. These required fields are not displayed as measured usage.
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
    }
  }
}

export function createPiModels(
  request: (messages: Message[], signal?: AbortSignal) => Promise<PiRoundResult>,
  contextTokens: number
) {
  const models = createModels()
  function stream(_model: Model<Api>, context: TranscriptContext, options?: StreamOptions) {
    const events = createAssistantMessageEventStream()
    const message = piAssistantMessage()
    events.push({ type: 'start', partial: message })
    void complete()
    return events

    async function complete() {
      try {
        const { resolution, requestBytes } = await request(context.messages, options?.signal)
        if (requestBytes !== undefined) {
          // Estimates for compaction only; ToolResolver reports no billed usage.
          message.usage.input = estimatedTokens(requestBytes)
          message.usage.totalTokens = message.usage.input
        }
        if (
          resolution.toolName === 'pi_reply' ||
          resolution.toolName === 'needs_clarification' ||
          resolution.toolName === 'no_tools_match'
        ) {
          message.content = [
            {
              type: 'text',
              text:
                resolution.toolName === 'pi_reply'
                  ? String(resolution.input.text)
                  : resolution.reason
            }
          ]
        } else {
          message.stopReason = 'toolUse'
          message.content = [
            {
              type: 'toolCall',
              id: crypto.randomUUID(),
              name: resolution.toolName,
              arguments: resolution.input as JsonObject
            }
          ]
        }
        events.push({
          type: 'done',
          reason: message.stopReason === 'toolUse' ? 'toolUse' : 'stop',
          message
        })
      } catch (error) {
        message.stopReason = options?.signal?.aborted ? 'aborted' : 'error'
        const text = error instanceof Error ? error.message : String(error)
        // Pi recognizes overflow by message text; typed resolver overflows get a phrase it matches.
        message.errorMessage = isContextOverflowError(error)
          ? `Input exceeds the context window. ${text}`
          : text
        events.push({ type: 'error', reason: message.stopReason, error: message })
      }
    }
  }
  models.setProvider(
    createProvider({
      id: piModel.provider,
      auth: {
        apiKey: {
          name: 'Existing WebMCP adapter',
          async resolve() {
            return { auth: { apiKey: 'managed-by-host' } }
          }
        }
      },
      api: { stream, streamSimple: stream },
      models: [
        {
          id: piModel.modelId,
          name: 'Configured WebMCP resolver',
          provider: piModel.provider,
          api: 'webmcp',
          baseUrl: '',
          reasoning: false,
          input: ['text'],
          contextWindow: contextTokens,
          maxTokens: 2048,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
        }
      ]
    })
  )
  return models
}
