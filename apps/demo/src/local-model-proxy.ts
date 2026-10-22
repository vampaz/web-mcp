import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DemoConfig } from './interfaces/config.ts'

export function proxyRequestAllowed(
  path: string,
  method: string | undefined,
  origin: string | undefined,
  serverOrigin: string
): boolean {
  return (
    (!origin || origin === serverOrigin) &&
    ((path === '/__lmstudio/v1/models' && method === 'GET') ||
      (path === '/__lmstudio/v1/chat/completions' && method === 'POST'))
  )
}

export async function handleLocalModelRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: DemoConfig,
  origin: string
): Promise<void> {
  response.setHeader('Cache-Control', 'no-store')
  if (
    !proxyRequestAllowed(request.url ?? '', request.method, request.headers.origin, origin) ||
    request.headers.host !== new URL(origin).host ||
    (request.headers['sec-fetch-site'] &&
      !['same-origin', 'none'].includes(String(request.headers['sec-fetch-site'])))
  ) {
    response.writeHead(403).end('Local model proxy refused this request.')
    return
  }
  const controller = new AbortController()
  const timeout = setTimeout(function expired() {
    controller.abort()
  }, 120000)
  function disconnected() {
    if (!response.writableEnded) controller.abort()
  }
  response.on('close', disconnected)
  try {
    let body: string | undefined
    if (request.method === 'POST') {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of request) {
        size += Buffer.byteLength(chunk)
        if (size > 1024 * 1024) {
          response.writeHead(413).end('Resolver request is too large.')
          return
        }
        chunks.push(Buffer.from(chunk))
      }
      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString())
      } catch {
        response.writeHead(400).end('The resolver request must be valid JSON.')
        return
      }
      if (
        !payload ||
        typeof payload !== 'object' ||
        Array.isArray(payload) ||
        !config.modelId ||
        payload.model !== config.modelId ||
        !Array.isArray(payload.messages) ||
        payload.stream === true
      ) {
        response.writeHead(400).end('Use the configured local model and non-streaming messages.')
        return
      }
      body = JSON.stringify(payload)
    }
    const upstream = await fetch(config.baseUrl + request.url!.slice('/__lmstudio/v1'.length), {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {})
      },
      body,
      redirect: 'error',
      signal: controller.signal
    })
    const output = await upstream.text()
    response.writeHead(upstream.ok ? 200 : 502, { 'Content-Type': 'application/json' })
    response.end(
      upstream.ok
        ? output
        : JSON.stringify({
            error: 'LM Studio rejected the request. Check the configured model and server.'
          })
    )
  } catch {
    if (!response.writableEnded)
      response.writeHead(502, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({
          error: 'LM Studio is unavailable. Start the local server and load LM_STUDIO_MODEL.'
        })
      )
  } finally {
    clearTimeout(timeout)
    response.off('close', disconnected)
  }
}
