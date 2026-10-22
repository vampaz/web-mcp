// @vitest-environment node
import { expect, it } from 'vitest'
import { createPiModels, piModel } from './model-adapter'

it('uses the configured adapter without discovering remote providers', async function test() {
  const models = createPiModels(async function reply() {
    return {
      resolution: {
        toolName: 'pi_reply',
        input: { text: 'An answer' },
        confidence: 1,
        reason: 'Complete'
      }
    }
  }, 32_768)
  const model = models.getModel(piModel.provider, piModel.modelId)
  expect(model?.provider).toBe('webmcp')
})

it('reports the measured request size as usage so compaction follows what is sent', async function test() {
  const models = createPiModels(async function reply() {
    return {
      resolution: { toolName: 'pi_reply', input: { text: 'Hi' }, confidence: 1, reason: 'Reply' },
      requestBytes: 4000
    }
  }, 32_768)
  const model = models.getModel(piModel.provider, piModel.modelId)!
  const stream = models.stream(model, { messages: [] } as never)
  const message = await stream.result()
  expect(message.usage).toMatchObject({ input: 1000, totalTokens: 1000 })
})
