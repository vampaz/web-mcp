import { resolveLocalTlsUrl } from '@vampaz/vite-plugin-local-tls'

export const demoTlsOptions = { domain: 'webmcp-kit.localtest.me' }
export const demoOrigin = resolveLocalTlsUrl(demoTlsOptions)!
export const demoTestTlsOptions = { domain: 'webmcp-kit-tests.localtest.me' }
export const demoTestOrigin = resolveLocalTlsUrl(demoTestTlsOptions)!
