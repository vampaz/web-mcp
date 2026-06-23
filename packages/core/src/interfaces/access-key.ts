export type WebMCPAccessKeyType = 'publishable' | 'service-session'

export type WebMCPPaidServiceId =
  | 'hosted-openai-planner'
  | 'analytics'
  | 'hosted-evals'
  | (string & {})

export type WebMCPPaidServiceEnvironment = 'test' | 'live'

export interface WebMCPPaidServiceQuotaStatus {
  exhausted?: boolean
  limit?: number
  remaining?: number
  resetAt?: string
}

export interface WebMCPPaidServiceEntitlement {
  models?: string[]
  quota?: WebMCPPaidServiceQuotaStatus
  serviceId: WebMCPPaidServiceId
}

export interface WebMCPAccessKeyMetadata {
  allowedOrigins: string[]
  analyticsOptIn?: boolean
  customerId: string
  environment: WebMCPPaidServiceEnvironment
  expiresAt?: string
  issuedAt: string
  keyType: WebMCPAccessKeyType
  projectId: string
  quota?: WebMCPPaidServiceQuotaStatus
  services: WebMCPPaidServiceEntitlement[]
}

export interface WebMCPServiceSessionTokenMetadata {
  abuseChecks?: string[]
  expiresAt: string
  issuedAt: string
  keyFingerprint: string
  origin?: string
  projectId: string
  serviceId: WebMCPPaidServiceId
}

export interface WebMCPHostedPaidServiceMetadata {
  endpoint?: string
  label?: string
  requiresAccessKey?: boolean
  serviceId: WebMCPPaidServiceId
}

export interface WebMCPPaidServicesConfig {
  accessKey?: string
  services?: WebMCPHostedPaidServiceMetadata[]
}

export interface WebMCPAccessValidationSuccess {
  fingerprint: string
  metadata: WebMCPAccessKeyMetadata
  valid: true
}

export interface WebMCPAccessValidationFailure {
  code:
    | 'missing-key'
    | 'malformed-key'
    | 'unknown-key'
    | 'revoked-key'
    | 'expired-key'
    | 'wrong-origin'
    | 'wrong-service'
    | 'quota-exhausted'
  fingerprint?: string
  valid: false
}

export type WebMCPAccessValidationResult =
  | WebMCPAccessValidationSuccess
  | WebMCPAccessValidationFailure
