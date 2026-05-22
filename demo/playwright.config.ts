import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://127.0.0.1:60001',
    browserName: 'chromium',
    channel: 'chrome-beta'
  },
  webServer: {
    command: 'npm run dev',
    env: {
      CLOUDFLARE_REMOTE_BINDINGS: 'false'
    },
    url: 'http://127.0.0.1:60001',
    reuseExistingServer: true
  }
})
