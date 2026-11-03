export interface PaidAccessSession {
  expiresAt?: string
  token: string
  tokenType: 'Bearer'
}

export interface HostedSessionRequest {
  promise: Promise<PaidAccessSession>
  controller: AbortController
}

export type HostedSessionState =
  | { kind: 'empty' }
  | { kind: 'acquiring'; request: HostedSessionRequest; waiters: number }
  | { kind: 'ready'; session: PaidAccessSession }

export type HostedSessionEvent =
  | { type: 'acquire'; request: HostedSessionRequest }
  | { type: 'join'; request: HostedSessionRequest }
  | { type: 'leave'; request: HostedSessionRequest; cancelled: boolean }
  | { type: 'resolve'; request: HostedSessionRequest; session: PaidAccessSession }
  | { type: 'reject'; request: HostedSessionRequest }
  | { type: 'invalidate'; session: PaidAccessSession }
