/**
 * True only with a positive development signal, so warnings stay silent by
 * default in production browsers.
 *
 * The literal `process.env.NODE_ENV` form lets consumer bundlers replace it
 * statically; runtimes without `process` (and without replacement) throw and
 * land in the catch.
 */
export function isDevelopmentEnvironment(): boolean {
  try {
    const nodeEnv = process.env.NODE_ENV

    return nodeEnv === 'development' || nodeEnv === 'test'
  } catch {
    return false
  }
}
