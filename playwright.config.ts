import { defineConfig, devices } from '@playwright/test'
import { demoTestOrigin } from './apps/demo/local-tls'
import './scripts/playwright-trust'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

// shortcut: isolate macOS app data until Playwright includes the Firefox 158 fix.
const firefoxHome =
  process.platform === 'darwin' ? join(import.meta.dirname, 'test-results/firefox-home') : undefined
if (firefoxHome) mkdirSync(firefoxHome, { recursive: true })

const firefoxPolicy =
  process.platform === 'linux' && process.env.CI === 'true' && process.env.RUNNER_TEMP
    ? join(process.env.RUNNER_TEMP, 'webmcp-firefox-policies.json')
    : undefined
// Browser projects run every spec except these, so a new spec cannot fall outside all projects.
const separateSuites = ['**/lmstudio.spec.ts', '**/webmcp-native.spec.ts']
const chromiumOnly = ['**/pi-assistant.spec.ts']

export default defineConfig({
  testDir: './apps/demo/tests/e2e',
  outputDir: 'test-results/browser',
  reporter: [['list'], ['json', { outputFile: 'test-results/browser-results.json' }]],
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
      testIgnore: separateSuites,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: ['--disable-blink-features=WebMCP'] }
      }
    },
    {
      name: 'firefox',
      testIgnore: [...separateSuites, ...chromiumOnly],
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: {
          env: {
            ...process.env,
            ...(firefoxHome ? { CFFIXED_USER_HOME: firefoxHome } : {}),
            ...(firefoxPolicy ? { PLAYWRIGHT_FIREFOX_POLICIES_JSON: firefoxPolicy } : {})
          }
        }
      }
    },
    {
      name: 'webkit',
      testIgnore: [...separateSuites, ...chromiumOnly],
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
