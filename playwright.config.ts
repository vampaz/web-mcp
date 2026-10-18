import { defineConfig, devices } from '@playwright/test'
import { demoTestOrigin } from './apps/demo/local-tls'
import './scripts/playwright-trust'
import { join } from 'node:path'

const firefoxPolicy =
  process.platform === 'linux' && process.env.CI === 'true' && process.env.RUNNER_TEMP
    ? join(process.env.RUNNER_TEMP, 'webmcp-firefox-policies.json')
    : undefined

export default defineConfig({
  testDir: './apps/demo/tests/e2e',
  outputDir: 'test-results/browser',
  reporter: [['list'], ['json', { outputFile: 'test-results/browser-results.json' }]],
  testIgnore: '**/lmstudio.spec.ts',
  fullyParallel: false,
  workers: 2,
  retries: 0,
  timeout: 30000,
  expect: { timeout: 10000 },
  use: { baseURL: demoTestOrigin, trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev:demo',
    url: demoTestOrigin,
    env: { WEBMCP_TEST_FIXTURES: 'true', WEBMCP_BROWSER_TEST: 'true' },
    reuseExistingServer: false
  },
  projects: [
    {
      name: 'chromium',
      testMatch: /(?:core|pi-assistant|pi-storage|webmcp-chat)\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: ['--disable-blink-features=WebMCP'] }
      }
    },
    {
      name: 'firefox',
      testMatch: /(?:core|pi-storage|webmcp-chat)\.spec\.ts/,
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: {
          env: {
            ...process.env,
            ...(firefoxPolicy ? { PLAYWRIGHT_FIREFOX_POLICIES_JSON: firefoxPolicy } : {})
          }
        }
      }
    },
    {
      name: 'webkit',
      testMatch: /(?:core|pi-storage|webmcp-chat)\.spec\.ts/,
      use: { ...devices['Desktop Safari'] }
    },
    {
      name: 'native-chromium',
      testMatch: '**/webmcp-native.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: ['--enable-blink-features=WebMCP'] }
      }
    }
  ]
})
