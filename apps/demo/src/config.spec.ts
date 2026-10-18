import { expect, it } from 'vitest'
import { resolveDemoConfig } from './config'

it('keeps optional credentials on the server and requires an explicit model', function test() {
  expect(resolveDemoConfig({})).toMatchObject({
    baseUrl: 'http://127.0.0.1:1234/v1',
    modelId: '',
    fixtures: false
  })
  expect(
    resolveDemoConfig({ LM_STUDIO_MODEL: 'chosen', LM_STUDIO_API_TOKEN: 'secret' }).modelId
  ).toBe('chosen')
})
it.each([
  'https://example.com/v1',
  'http://127.0.0.1:1234/v1?target=elsewhere',
  'file:///v1',
  'http://secret@localhost:1234/v1',
  'http://127.0.0.1/other'
])('rejects an unsafe target %s', function test(target) {
  expect(function invalid() {
    resolveDemoConfig({ LM_STUDIO_BASE_URL: target })
  }).toThrow()
})
