import cloudflare from '@astrojs/cloudflare'
import vue from '@astrojs/vue'
import { defineConfig } from 'astro/config'
import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import caddyTls from 'vite-plugin-caddy-multiple-tls'

if (fs.existsSync('./.env')) {
  dotenv.config({ path: './.env' })
}

const cloudflareConfigPath = process.env.CLOUDFLARE_CONFIG_PATH?.trim()
const caddyTlsDomain = process.env.CADDY_TLS_DOMAIN?.trim() || 'web-mcp.localtest.me'
const repositoryRoot = 'https://github.com/vampaz/web-mcp/blob/master/'

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
    configPath: cloudflareConfigPath || undefined
  }),
  markdown: {
    remarkPlugins: [
      rewriteRepositoryMarkdownLinks
    ]
  },
  integrations: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === 'webmcp-command-input'
        }
      }
    })
  ],
  vite: {
    plugins: [
      caddyTls({
        domain: caddyTlsDomain,
        loopbackDomain: 'localtest.me'
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src')
      }
    }
  }
})

function rewriteRepositoryMarkdownLinks() {
  return function transformMarkdownLinks(tree, file) {
    if (!isRepositoryReadme(file)) return

    rewriteMarkdownNodeLinks(tree)
  }
}

function isRepositoryReadme(file) {
  const paths = Array.isArray(file?.history) ? file.history : [file?.path]

  return paths.some(function isReadmePath(filePath) {
    return typeof filePath === 'string' && filePath.endsWith('README.md')
  })
}

function rewriteMarkdownNodeLinks(node) {
  if (!node || typeof node !== 'object') return

  if (
    node.type === 'link'
    && typeof node.url === 'string'
    && (node.url.startsWith('./') || node.url.startsWith('../'))
  ) {
    node.url = new URL(node.url, repositoryRoot).href
  }

  if (!Array.isArray(node.children)) return

  for (const child of node.children) {
    rewriteMarkdownNodeLinks(child)
  }
}
