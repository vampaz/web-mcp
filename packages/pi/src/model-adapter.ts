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
import type { Message } from '@earendil-works/pi-ai'
import type { ToolPlan } from '@vampaz/webmcp-kit'

export const piModel = { provider: 'webmcp', modelId: 'configured-planner' }

export function createPiModels(
  request: (messages: Message[], signal?: AbortSignal) => Promise<ToolPlan>
) {
  const models = createModels()
  function stream(_model: Model<Api>, context: TranscriptContext, options?: StreamOptions) {
    const events = createAssistantMessageEventStream()
    const message: AssistantMessage = {
      role: 'assistant',
      content: [],
      api: 'webmcp',
      provider: piModel.provider,
      model: piModel.modelId,
      stopReason: 'stop',
      timestamp: Date.now(),
      // ToolPlanner does not expose usage. These required fields are not displayed as measured usage.
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
      }
    }
    events.push({ type: 'start', partial: message })
    void complete()
    return events

    async function complete() {
      try {
        const plan = (await request(context.messages, options?.signal)) as ToolPlan
        if (
          plan.toolName === 'pi_reply' ||
          plan.toolName === 'needs_clarification' ||
          plan.toolName === 'no_tools_match'
        ) {
          message.content = [
            {
              type: 'text',
              text: plan.toolName === 'pi_reply' ? String(plan.input.text) : plan.reason
            }
          ]
        } else {
          message.stopReason = 'toolUse'
          message.content = [
            {
              type: 'toolCall',
              id: crypto.randomUUID(),
              name: plan.toolName,
              arguments: plan.input as JsonObject
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
        message.errorMessage = error instanceof Error ? error.message : String(error)
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
          name: 'Configured WebMCP planner',
          provider: piModel.provider,
          api: 'webmcp',
          baseUrl: '',
          reasoning: false,
          input: ['text'],
          contextWindow: 32768,
          maxTokens: 2048,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
        }
      ]
    })
  )
  return models
}
