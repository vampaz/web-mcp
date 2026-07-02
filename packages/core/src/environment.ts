/**
 * True only with a positive development signal, so warnings stay silent by
 * default in production browsers.
 *
 * Browser runtimes may not expose `process`, so read through `globalThis`.
 */
export function isDevelopmentEnvironment(): boolean {
  const runtime = globalThis as { process?: { env?: { NODE_ENV?: string } } }
  const nodeEnv = runtime.process?.env?.NODE_ENV

  return nodeEnv === 'development' || nodeEnv === 'test'
}
