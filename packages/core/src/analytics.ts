import { subscribeWebMCPKitEvents } from './events'
import type { WebMCPPaidServicesConfig } from './interfaces/access-key'
import type { WebMCPKitEvent } from './interfaces/tool'

export type WebMCPAnalyticsEventType = WebMCPKitEvent['type']

export interface WebMCPAnalyticsOptions {
  enabled?: boolean
  endpoint?: string
  eventTypes?: WebMCPAnalyticsEventType[]
  includeEventDetail?: boolean
  paidServices?: WebMCPPaidServicesConfig
}

export interface WebMCPAnalytics {
  start: () => void
  stop: () => void
  track: (event: WebMCPKitEvent) => Promise<void>
}

const defaultEventTypes = new Set<WebMCPAnalyticsEventType>([
  'registered',
  'unregistered',
  'invoked',
  'succeeded',
  'failed',
  'blocked'
])

export function createWebMCPAnalytics(options: WebMCPAnalyticsOptions = {}): WebMCPAnalytics {
  let unsubscribe: (() => void) | undefined
  const configuredEventTypes = new Set(options.eventTypes ?? defaultEventTypes)

  async function track(event: WebMCPKitEvent): Promise<void> {
    if (!options.enabled || !options.endpoint) return
    if (!configuredEventTypes.has(event.type)) return

    await fetch(options.endpoint, {
      method: 'POST',
      headers: getAnalyticsHeaders(options.paidServices),
      body: JSON.stringify({
        event: serializeAnalyticsEvent(event, Boolean(options.includeEventDetail))
      })
    })
  }

  return {
    start() {
      if (unsubscribe || !options.enabled) return
      unsubscribe = subscribeWebMCPKitEvents(function trackEvent(event) {
        void track(event)
      })
    },
    stop() {
      unsubscribe?.()
      unsubscribe = undefined
    },
    track
  }
}

function getAnalyticsHeaders(paidServices: WebMCPPaidServicesConfig | undefined) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (paidServices?.accessKey) {
    headers.Authorization = `Bearer ${paidServices.accessKey}`
  }

  return headers
}

function serializeAnalyticsEvent(event: WebMCPKitEvent, includeEventDetail: boolean) {
  return {
    detail: includeEventDetail ? redactAnalyticsValue(event.detail) : undefined,
    timestamp: event.timestamp,
    toolName: event.toolName,
    type: event.type
  }
}

function redactAnalyticsValue(value: unknown): unknown {
  if (typeof value === 'string') return redactAnalyticsString(value)
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(redactAnalyticsValue)

  return Object.fromEntries(
    Object.entries(value).map(function mapEntry([key, item]) {
      if (isSensitiveAnalyticsKey(key)) return [key, '[redacted]']
      return [key, redactAnalyticsValue(item)]
    })
  )
}

function redactAnalyticsString(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/wmcp_pk_(?:test|live)_[A-Za-z0-9_-]+_[A-Za-z0-9_-]+/g, 'wmcp_pk_[redacted]')
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-[redacted]')
}

function isSensitiveAnalyticsKey(key: string): boolean {
  return /token|secret|password|apiKey|accessKey|authorization/i.test(key)
}
