// @vitest-environment node
import { createServer, request as httpRequest, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, expect, it, vi } from 'vitest'
import { handleLocalModelRequest, proxyRequestAllowed } from './local-model-proxy'

const servers: Server[] = []
afterEach(async function cleanup() {
  await Promise.all(
    servers.splice(0).map(function close(server) {
      return new Promise<void>(function closed(resolve) {
        server.close(function done() {
          resolve()
        })
        server.closeAllConnections()
      })
    })
  )
})

async function listen(server: Server): Promise<string> {
  servers.push(server)
  await new Promise<void>(function ready(resolve) {
    server.listen(0, '127.0.0.1', resolve)
  })
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

function getProxy(url: string, headers: Record<string, string>): Promise<number | undefined> {
  return new Promise(function response(resolve, reject) {
    const request = httpRequest(url, { headers }, function received(response) {
      response.resume()
      resolve(response.statusCode)
    })
    request.on('error', reject)
    request.end()
  })
}

it('allows only exact methods, paths, and same-origin requests', function test() {
  const origin = 'https://webmcp-kit.localtest.me'
  expect(proxyRequestAllowed('/__lmstudio/v1/models', 'GET', undefined, origin)).toBe(true)
  expect(proxyRequestAllowed('/__lmstudio/api/v0/models', 'GET', undefined, origin)).toBe(true)
  expect(proxyRequestAllowed('/__lmstudio/v1/chat/completions', 'POST', origin, origin)).toBe(true)
  expect(proxyRequestAllowed('/__lmstudio/v1/models', 'GET', 'https://evil.example', origin)).toBe(
    false
  )
  expect(proxyRequestAllowed('/__lmstudio/v1/models?target=x', 'GET', origin, origin)).toBe(false)
  expect(proxyRequestAllowed('/__lmstudio/v1/chat/completions', 'GET', origin, origin)).toBe(false)
})

it('keeps the local token upstream and rejects malformed or foreign requests before dispatch', async function boundary() {
  const forwarded = vi.fn()
  const upstream = await listen(
    createServer(function model(request, response) {
      if (request.url === '/api/v0/models') {
        response.setHeader('Content-Type', 'application/json')
        response.end(
          JSON.stringify({
            data: [
              { id: 'chosen', type: 'llm' },
              { id: 'alternate', type: 'vlm' },
              { id: 'embedding', type: 'embeddings' }
            ]
          })
        )
        return
      }
      forwarded(request.headers.authorization)
      response.setHeader('Content-Type', 'application/json')
      response.end('{"choices":[]}')
    })
  )
  let origin = ''
  origin = await listen(
    createServer(function proxy(request, response) {
      void handleLocalModelRequest(
        request,
        response,
        {
          baseUrl: upstream + '/v1',
          modelId: 'chosen',
          token: 'local-model-token',
          fixtures: false
        },
        origin
      )
    })
  )
  const endpoint = origin + '/__lmstudio/v1/chat/completions'
  const valid = await fetch(endpoint, {
    method: 'POST',
    headers: { Origin: origin, Authorization: 'Bearer account-token' },
    body: JSON.stringify({ model: 'chosen', messages: [] })
  })
  expect(valid.status).toBe(200)
  expect(await valid.text()).not.toContain('token')
  expect(forwarded).toHaveBeenCalledWith('Bearer local-model-token')
  for (const body of [
    '{',
    'null',
    JSON.stringify({ model: 'different', messages: [] }),
    JSON.stringify({ model: 'embedding', messages: [] })
  ]) {
    expect(
      (await fetch(endpoint, { method: 'POST', headers: { Origin: origin }, body })).status
    ).toBe(400)
  }
  expect(
    (
      await fetch(endpoint, {
        method: 'POST',
        headers: { Origin: 'https://foreign.example' },
        body: '{}'
      })
    ).status
  ).toBe(403)
  expect(forwarded).toHaveBeenCalledTimes(1)
  expect(
    (
      await fetch(endpoint, {
        method: 'POST',
        headers: { Origin: origin },
        body: JSON.stringify({ model: 'alternate', messages: [] })
      })
    ).status
  ).toBe(200)
  expect(forwarded).toHaveBeenCalledTimes(2)
})

it('refuses upstream redirects without forwarding credentials to the redirect target', async function redirect() {
  const target = vi.fn()
  const destination = await listen(
    createServer(function targetServer(_request, response) {
      target()
      response.end('{}')
    })
  )
  const upstream = await listen(
    createServer(function redirect(_request, response) {
      response.writeHead(302, { Location: destination }).end()
    })
  )
  let origin = ''
  origin = await listen(
    createServer(function proxy(request, response) {
      void handleLocalModelRequest(
        request,
        response,
        { baseUrl: upstream + '/v1', modelId: 'chosen', token: 'secret', fixtures: false },
        origin
      )
    })
  )
  const response = await fetch(origin + '/__lmstudio/v1/models')
  expect(response.status).toBe(502)
  expect(await response.text()).not.toContain('secret')
  expect(target).not.toHaveBeenCalled()
})

it('checks the public TLS host and origin after local TLS termination', async function tls() {
  const origin = 'https://webmcp-kit.localtest.me'
  const forwarded = vi.fn()
  const upstream = await listen(
    createServer(function model(_request, response) {
      forwarded()
      response.end('{}')
    })
  )
  const proxy = await listen(
    createServer(function request(request, response) {
      void handleLocalModelRequest(
        request,
        response,
        { baseUrl: upstream + '/v1', modelId: 'chosen', fixtures: false },
        origin
      )
    })
  )
  const url = proxy + '/__lmstudio/v1/models'
  expect(
    await getProxy(url, {
      Host: 'webmcp-kit.localtest.me',
      Origin: origin,
      'Sec-Fetch-Site': 'same-origin'
    })
  ).toBe(200)
  const rejected: Record<string, string>[] = [
    { Host: 'webmcp-kit.localtest.me', Origin: 'http://webmcp-kit.localtest.me' },
    { Host: 'forged.example', Origin: origin },
    { Host: 'webmcp-kit.localtest.me', Origin: origin, 'Sec-Fetch-Site': 'cross-site' }
  ]
  for (const headers of rejected) expect(await getProxy(url, headers)).toBe(403)
  expect(forwarded).toHaveBeenCalledOnce()
})
