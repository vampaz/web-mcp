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
const caddyTlsDomain = process.env.CADDY_TLS_DOMAIN?.trim() || 'webmcp.localtest.me'
const repositoryRoot = 'https://github.com/vampaz/web-mcp/blob/master/'

export default defineConfig({
  devToolbar: {
    enabled: false
  },
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
    remarkPlugins: [rewriteRepositoryMarkdownLinks],
    rehypePlugins: [renderMermaidCodeFences]
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
    },
    optimizeDeps: {
      include: ['@mlc-ai/web-llm']
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
    node.type === 'link' &&
    typeof node.url === 'string' &&
    (node.url.startsWith('./') || node.url.startsWith('../'))
  ) {
    node.url = new URL(node.url, repositoryRoot).href
  }

  if (!Array.isArray(node.children)) return

  for (const child of node.children) {
    rewriteMarkdownNodeLinks(child)
  }
}

function renderMermaidCodeFences() {
  return function transformMermaidCodeFences(tree) {
    replaceMermaidCodeFenceNodes(tree)
  }
}

function replaceMermaidCodeFenceNodes(node) {
  if (!node || typeof node !== 'object') return

  if (Array.isArray(node.children)) {
    node.children = node.children.map(function mapChild(child) {
      if (isMermaidCodeFenceNode(child)) {
        return {
          type: 'element',
          tagName: 'div',
          properties: {
            className: ['mermaid', 'readme-mermaid']
          },
          children: [
            {
              type: 'text',
              value: getMermaidCodeFenceText(child)
            }
          ]
        }
      }

      replaceMermaidCodeFenceNodes(child)
      return child
    })
  }
}

function isMermaidCodeFenceNode(node) {
  const codeNode = getCodeFenceNode(node)
  if (!codeNode) return false
  if (node.properties?.dataLanguage === 'mermaid') return true
  const className = codeNode.properties?.className

  return Array.isArray(className) && className.includes('language-mermaid')
}

function getCodeFenceNode(node) {
  if (!node || typeof node !== 'object') return undefined
  if (node.type !== 'element' || node.tagName !== 'pre') return undefined
  const firstChild = node.children?.[0]
  if (!firstChild || firstChild.type !== 'element' || firstChild.tagName !== 'code')
    return undefined

  return firstChild
}

function getMermaidCodeFenceText(node) {
  const codeNode = getCodeFenceNode(node)

  return getNodeText(codeNode)
}

function getNodeText(node) {
  if (!node || typeof node !== 'object') return ''
  if (node.type === 'text' && typeof node.value === 'string') return node.value
  if (!Array.isArray(node.children)) return ''

  return node.children.map(getNodeText).join('')
}
