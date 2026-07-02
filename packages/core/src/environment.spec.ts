import { afterEach, describe, expect, it, vi } from 'vitest'

import { isDevelopmentEnvironment } from './environment'

describe('isDevelopmentEnvironment', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is true for development and test node environments', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(isDevelopmentEnvironment()).toBe(true)

    vi.stubEnv('NODE_ENV', 'test')
    expect(isDevelopmentEnvironment()).toBe(true)
  })

  it('is false for production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(isDevelopmentEnvironment()).toBe(false)
  })

  it('is false without a positive development signal', () => {
    vi.stubEnv('NODE_ENV', '')
    expect(isDevelopmentEnvironment()).toBe(false)
  })
})
