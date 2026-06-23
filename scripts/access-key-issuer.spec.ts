// @vitest-environment node

import { describe, expect, it } from 'vitest'

import {
  getAccessKeyFingerprint,
  hashAccessKey,
  issueAccessKey,
  parseAccessKey,
  validateAccessKey,
  type AccessKeyIssuerInput,
  type AccessKeyRecord
} from './access-key-issuer'

const signingSecret = 'test-signing-secret-with-more-than-32-chars'
const issuedAt = new Date('2026-06-23T00:00:00.000Z')

function createIssuerInput(overrides: Partial<AccessKeyIssuerInput> = {}): AccessKeyIssuerInput {
  return {
    allowedOrigins: ['https://example.com'],
    customerId: 'cus_123',
    environment: 'test',
    projectId: 'prj_123',
    services: [
      {
        quota: {
          remaining: 100
        },
        serviceId: 'hosted-openai-planner'
      }
    ],
    ...overrides
  }
}

function issueFixture(overrides: Partial<AccessKeyIssuerInput> = {}) {
  return issueAccessKey(createIssuerInput(overrides), {
    id: 'abc123xyz',
    now: issuedAt,
    secret: 'secret123secret456',
    signingSecret
  })
}

describe('access key issuer', () => {
  it('issues a compact publishable key and stores only hash metadata', () => {
    const result = issueFixture()

    expect(result.key).toBe('wmcp_pk_test_abc123xyz_secret123secret456')
    expect(result.record).toMatchObject({
      fingerprint: getAccessKeyFingerprint('test', 'abc123xyz'),
      id: 'abc123xyz',
      metadata: {
        allowedOrigins: ['https://example.com'],
        customerId: 'cus_123',
        issuedAt: issuedAt.toISOString(),
        keyType: 'publishable',
        projectId: 'prj_123'
      }
    })
    expect(result.record.hash).toBe(hashAccessKey(result.key, signingSecret))
    expect(JSON.stringify(result.record)).not.toContain(result.key)
    expect(JSON.stringify(result.record)).not.toContain('secret123secret456')
  })

  it('validates a known key for the right service and origin', () => {
    const result = issueFixture()

    expect(
      validateAccessKey({
        key: result.key,
        origin: 'https://example.com/app',
        records: [result.record],
        serviceId: 'hosted-openai-planner',
        signingSecret
      })
    ).toMatchObject({
      fingerprint: result.record.fingerprint,
      valid: true
    })
  })

  it('rejects unknown keys', () => {
    const result = issueFixture()

    expect(
      validateAccessKey({
        key: 'wmcp_pk_test_unknown99_secret123secret456',
        origin: 'https://example.com',
        records: [result.record],
        serviceId: 'hosted-openai-planner',
        signingSecret
      })
    ).toMatchObject({
      code: 'unknown-key',
      valid: false
    })
  })

  it('rejects wrong services', () => {
    const result = issueFixture()

    expect(
      validateAccessKey({
        key: result.key,
        origin: 'https://example.com',
        records: [result.record],
        serviceId: 'analytics',
        signingSecret
      })
    ).toMatchObject({
      code: 'wrong-service',
      valid: false
    })
  })

  it('rejects wrong origins', () => {
    const result = issueFixture()

    expect(
      validateAccessKey({
        key: result.key,
        origin: 'https://evil.example',
        records: [result.record],
        serviceId: 'hosted-openai-planner',
        signingSecret
      })
    ).toMatchObject({
      code: 'wrong-origin',
      valid: false
    })
  })

  it('rejects expired keys', () => {
    const result = issueFixture({
      expiresAt: '2026-06-24T00:00:00.000Z'
    })

    expect(
      validateAccessKey({
        key: result.key,
        now: new Date('2026-06-24T00:00:00.001Z'),
        origin: 'https://example.com',
        records: [result.record],
        serviceId: 'hosted-openai-planner',
        signingSecret
      })
    ).toMatchObject({
      code: 'expired-key',
      valid: false
    })
  })

  it('rejects quota exhausted keys', () => {
    const result = issueFixture({
      quota: {
        remaining: 0
      }
    })

    expect(
      validateAccessKey({
        key: result.key,
        origin: 'https://example.com',
        records: [result.record],
        serviceId: 'hosted-openai-planner',
        signingSecret
      })
    ).toMatchObject({
      code: 'quota-exhausted',
      valid: false
    })
  })

  it('rejects malformed keys', () => {
    expect(
      validateAccessKey({
        key: 'not-a-webmcp-key',
        origin: 'https://example.com',
        records: [],
        serviceId: 'hosted-openai-planner',
        signingSecret
      })
    ).toMatchObject({
      code: 'malformed-key',
      valid: false
    })
  })

  it('rejects revoked keys', () => {
    const result = issueFixture()
    const revokedRecord: AccessKeyRecord = {
      ...result.record,
      revokedAt: '2026-06-24T00:00:00.000Z'
    }

    expect(
      validateAccessKey({
        key: result.key,
        origin: 'https://example.com',
        records: [revokedRecord],
        serviceId: 'hosted-openai-planner',
        signingSecret
      })
    ).toMatchObject({
      code: 'revoked-key',
      valid: false
    })
  })

  it('parses valid keys only', () => {
    expect(parseAccessKey('wmcp_pk_live_abc123xyz_secret123secret456')).toEqual({
      environment: 'live',
      id: 'abc123xyz'
    })
    expect(parseAccessKey('wmcp_secret_live_abc123xyz_secret123secret456')).toBeNull()
  })
})
