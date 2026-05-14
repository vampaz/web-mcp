import cloudflare from '@astrojs/cloudflare'
import vue from '@astrojs/vue'
import { defineConfig } from 'astro/config'
import dotenv from 'dotenv'
import fs from 'node:fs'
import caddyTls from 'vite-plugin-caddy-multiple-tls'

if (fs.existsSync('./.dev.vars')) {
  dotenv.config({ path: './.dev.vars' })
}

const cloudflareConfigPath = process.env.CLOUDFLARE_CONFIG_PATH?.trim()
const remoteBindings = process.env.CLOUDFLARE_REMOTE_BINDINGS === 'true'
const caddyTlsDomain = process.env.CADDY_TLS_DOMAIN?.trim() || 'web-mcp.localtest.me'

export default defineConfig({
  output: 'server',
  srcDir: './src/',
  root: './',
  server: {
    host: true,
    port: 60001,
    allowedHosts: true
  },
  adapter: cloudflare({
    configPath: cloudflareConfigPath || undefined,
    remoteBindings
  }),
  integrations: [vue()],
  vite: {
    plugins: [
      caddyTls({
        domain: caddyTlsDomain,
        loopbackDomain: 'localtest.me'
      })
    ],
    resolve: {
      alias: {
        '@': '/src'
      }
    }
  }
})
