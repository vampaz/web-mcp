import { defineConfig, devices } from '@playwright/test'
import { demoTestOrigin } from './apps/demo/local-tls'
import './scripts/playwright-trust'

export default defineConfig({
  testDir: './apps/demo/tests/e2e',
  testMatch: '**/lmstudio.spec.ts',
  outputDir: 'test-results/lmstudio',
  reporter: [['list'], ['json', { outputFile: 'test-results/lmstudio-results.json' }]],
  workers: 1,
  retries: 0,
  timeout: 240000,
  expect: { timeout: 120000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: demoTestOrigin,
    trace: 'retain-on-failure',
    launchOptions: { args: ['--disable-blink-features=WebMCP'] }
  },
  webServer: {
    command: 'npm run dev:demo',
    url: demoTestOrigin,
    env: { WEBMCP_TEST_FIXTURES: 'false', WEBMCP_BROWSER_TEST: 'true' },
    reuseExistingServer: false
  }
})
