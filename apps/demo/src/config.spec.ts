import { expect, it } from 'vitest'
import { resolveDemoConfig } from './config'

it('keeps optional credentials on the server and accepts an initial model preference', function test() {
  expect(resolveDemoConfig({})).toMatchObject({
    baseUrl: 'http://127.0.0.1:1234/v1',
    modelId: '',
    fixtures: false
  })
  expect(
    resolveDemoConfig({ LM_STUDIO_MODEL: 'chosen', LM_STUDIO_API_TOKEN: 'secret' }).modelId
  ).toBe('chosen')
})
it('confines test responses to the separate browser-test server', function testsOnly() {
  expect(resolveDemoConfig({ WEBMCP_TEST_FIXTURES: 'true' }).fixtures).toBe(false)
  expect(
    resolveDemoConfig({ WEBMCP_TEST_FIXTURES: 'true', WEBMCP_BROWSER_TEST: 'true' }).fixtures
  ).toBe(true)
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
  }).toThrow('LM_STUDIO_BASE_URL must be a loopback HTTP(S) URL ending in /v1.')
})
