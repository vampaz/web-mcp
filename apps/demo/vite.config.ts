import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import localTls from '@vampaz/vite-plugin-local-tls'
import { demoOrigin, demoTlsOptions, demoTestOrigin, demoTestTlsOptions } from './local-tls'
import { sourceAliases } from '../../source-aliases'
import { resolveDemoConfig } from './src/config'
import { handleLocalModelRequest } from './src/local-model-proxy'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(function config({ mode }) {
  const local = resolveDemoConfig({ ...loadEnv(mode, root, ''), ...process.env })
  const testing = process.env.WEBMCP_BROWSER_TEST === 'true'
  const origin = testing ? demoTestOrigin : demoOrigin
  return {
    root,
    resolve: { alias: [...sourceAliases, { find: /^@\//, replacement: root + 'src/' }] },
    server: {
      host: '127.0.0.1',
      port: testing ? 4174 : 4173,
      strictPort: true,
      allowedHosts: [new URL(origin).hostname],
      fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] }
    },
    preview: { host: '127.0.0.1', allowedHosts: [new URL(origin).hostname] },
    plugins: [
      vue(),
      localTls(testing ? demoTestTlsOptions : demoTlsOptions),
      {
        name: 'local-model-proxy',
        configureServer(server) {
          server.middlewares.use(function localEndpoints(request, response, next) {
            if (request.url === '/__demo-config') {
              response.setHeader('Cache-Control', 'no-store')
              response.setHeader('Content-Type', 'application/json')
              response.end(JSON.stringify({ modelId: local.modelId, fixtures: local.fixtures }))
            } else if (request.url?.startsWith('/__lmstudio/')) {
              void handleLocalModelRequest(request, response, local, origin)
            } else next()
          })
        }
      }
    ]
  }
})
