import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import type {
  WebMCPAccessKeyMetadata,
  WebMCPAccessValidationResult,
  WebMCPPaidServiceEntitlement,
  WebMCPPaidServiceEnvironment,
  WebMCPPaidServiceId,
  WebMCPPaidServiceQuotaStatus
} from '../packages/core/src/interfaces/access-key'

export interface AccessKeyIssuerOptions {
  id?: string
  now?: Date
  secret?: string
  signingSecret: string
}

export interface AccessKeyIssuerInput {
  allowedOrigins: string[]
  analyticsOptIn?: boolean
  customerId: string
  environment: WebMCPPaidServiceEnvironment
  expiresAt?: string
  projectId: string
  quota?: WebMCPPaidServiceQuotaStatus
  services: WebMCPPaidServiceEntitlement[]
}

export interface AccessKeyRecord {
  fingerprint: string
  hash: string
  id: string
  metadata: WebMCPAccessKeyMetadata
  revokedAt?: string
}

export interface AccessKeyIssueResult {
  key: string
  record: AccessKeyRecord
}

export interface AccessKeyValidationInput {
  key: string
  now?: Date
  origin?: string
  records: AccessKeyRecord[]
  serviceId: WebMCPPaidServiceId
  signingSecret: string
}

const keyPrefix = 'wmcp_pk'
const minIssuerSecretLength = 32

export function issueAccessKey(
  input: AccessKeyIssuerInput,
  options: AccessKeyIssuerOptions
): AccessKeyIssueResult {
  assertIssuerSecret(options.signingSecret)
  const id = options.id ?? randomToken(10)
  const secret = options.secret ?? randomToken(24)
  const issuedAt = (options.now ?? new Date()).toISOString()
  const key = `${keyPrefix}_${input.environment}_${id}_${secret}`
  const fingerprint = getAccessKeyFingerprint(input.environment, id)
  const metadata: WebMCPAccessKeyMetadata = {
    allowedOrigins: input.allowedOrigins.map(normalizeOrigin).filter(Boolean),
    analyticsOptIn: input.analyticsOptIn,
    customerId: input.customerId,
    environment: input.environment,
    expiresAt: input.expiresAt,
    issuedAt,
    keyType: 'publishable',
    projectId: input.projectId,
    quota: input.quota,
    services: input.services
  }

  return {
    key,
    record: {
      fingerprint,
      hash: hashAccessKey(key, options.signingSecret),
      id,
      metadata
    }
  }
}

export function validateAccessKey(input: AccessKeyValidationInput): WebMCPAccessValidationResult {
  const parsed = parseAccessKey(input.key)
  if (!parsed) {
    return {
      code: 'malformed-key',
      valid: false
    }
  }

  assertIssuerSecret(input.signingSecret)
  const record = input.records.find(function findRecord(candidate) {
    return candidate.id === parsed.id
  })

  if (!record || !hashesMatch(record.hash, hashAccessKey(input.key, input.signingSecret))) {
    return {
      code: 'unknown-key',
      fingerprint: getAccessKeyFingerprint(parsed.environment, parsed.id),
      valid: false
    }
  }

  if (record.revokedAt) {
    return {
      code: 'revoked-key',
      fingerprint: record.fingerprint,
      valid: false
    }
  }

  const now = input.now ?? new Date()
  if (record.metadata.expiresAt && Date.parse(record.metadata.expiresAt) <= now.getTime()) {
    return {
      code: 'expired-key',
      fingerprint: record.fingerprint,
      valid: false
    }
  }

  const service = record.metadata.services.find(function findService(candidate) {
    return candidate.serviceId === input.serviceId
  })
  if (!service) {
    return {
      code: 'wrong-service',
      fingerprint: record.fingerprint,
      valid: false
    }
  }

  if (!isOriginAllowed(record.metadata.allowedOrigins, input.origin)) {
    return {
      code: 'wrong-origin',
      fingerprint: record.fingerprint,
      valid: false
    }
  }

  if (isQuotaExhausted(record.metadata.quota) || isQuotaExhausted(service.quota)) {
    return {
      code: 'quota-exhausted',
      fingerprint: record.fingerprint,
      valid: false
    }
  }

  return {
    fingerprint: record.fingerprint,
    metadata: record.metadata,
    valid: true
  }
}

export function hashAccessKey(key: string, signingSecret: string): string {
  assertIssuerSecret(signingSecret)

  return createHmac('sha256', signingSecret).update(key).digest('base64url')
}

export function getAccessKeyFingerprint(
  environment: WebMCPPaidServiceEnvironment,
  id: string
): string {
  const digest = createHash('sha256').update(`${environment}:${id}`).digest('base64url').slice(0, 8)

  return `wmcp_pk_${environment}_${id}_${digest}`
}

export function parseAccessKey(
  key: string
): { environment: WebMCPPaidServiceEnvironment; id: string } | null {
  const match = /^wmcp_pk_(test|live)_([A-Za-z0-9_-]{8,32})_([A-Za-z0-9_-]{16,96})$/.exec(key)
  if (!match) return null

  return {
    environment: match[1] as WebMCPPaidServiceEnvironment,
    id: match[2]
  }
}

function assertIssuerSecret(signingSecret: string): void {
  if (signingSecret.length < minIssuerSecretLength) {
    throw new Error(`Issuer signing secret must be at least ${minIssuerSecretLength} characters.`)
  }
}

function randomToken(byteLength: number): string {
  return randomBytes(byteLength).toString('base64url')
}

function hashesMatch(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(actual)
  if (expectedBuffer.length !== actualBuffer.length) return false

  return timingSafeEqual(expectedBuffer, actualBuffer)
}

function isOriginAllowed(allowedOrigins: string[], origin: string | undefined): boolean {
  if (allowedOrigins.includes('*')) return true

  const normalizedOrigin = normalizeOrigin(origin ?? '')
  if (!normalizedOrigin) return false

  return allowedOrigins.includes(normalizedOrigin)
}

function normalizeOrigin(value: string): string {
  if (value === '*') return value

  try {
    return new URL(value).origin
  } catch {
    return ''
  }
}

function isQuotaExhausted(quota: WebMCPPaidServiceQuotaStatus | undefined): boolean {
  return Boolean(quota?.exhausted || quota?.remaining === 0)
}
