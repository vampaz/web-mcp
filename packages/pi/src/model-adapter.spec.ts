// @vitest-environment node
import { expect, it } from 'vitest'
import { createPiModels, piModel } from './model-adapter'

it('uses the configured adapter without discovering remote providers', async function test() {
  const models = createPiModels(async function reply() {
    return { toolName: 'pi_reply', input: { text: 'An answer' }, confidence: 1, reason: 'Complete' }
  })
  const model = models.getModel(piModel.provider, piModel.modelId)
  expect(model?.provider).toBe('webmcp')
})
