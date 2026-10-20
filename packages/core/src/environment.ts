/** Keep the conventional expression so consumer bundlers can replace NODE_ENV. */
export function isDevelopmentEnvironment(): boolean {
  try {
    return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
  } catch {
    return false
  }
}
