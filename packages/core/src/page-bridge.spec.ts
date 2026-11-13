import { afterEach, describe, expect, it } from 'vitest'

import { setConfirmationHandler } from './confirmation'
import { defineTool } from './define-tool'
import { registerTool, clearToolsForTest } from './registry'
import {
  installPageBridge,
  PAGE_BRIDGE_PROTOCOL,
  type PageBridgeMessage,
  type PageBridgeReply
} from './page-bridge'
import type { WebMCPTool } from './interfaces/tool'

/** Test senders may deliberately use foreign protocol strings. */
type SendableRequest = {
  protocol: string
  kind: string
  requestId: string
  name?: string
  input?: Record<string, unknown>
}

function sendRequest(
  request: SendableRequest,
  replyKind?: PageBridgeReply['kind']
): Promise<PageBridgeReply> {
  return new Promise(function awaitReply(resolve, reject) {
    const timer = setTimeout(function timeout() {
      window.removeEventListener('message', onReply)
      reject(new Error('No bridge reply arrived.'))
    }, 1000)
    function onReply(event: MessageEvent) {
      const data = event.data as PageBridgeMessage | SendableRequest
      if (
        data?.protocol !== PAGE_BRIDGE_PROTOCOL ||
        !('requestId' in data) ||
        data.requestId !== request.requestId
      )
        return
      // The synthetic dispatch reaches this listener too; only accept reply kinds.
      if (data.kind === 'discover' || data.kind === 'invoke' || data.kind === 'cancel') return
      if (replyKind && data.kind !== replyKind) return
      clearTimeout(timer)
      window.removeEventListener('message', onReply)
      resolve(data as PageBridgeReply)
    }
    window.addEventListener('message', onReply)
    // jsdom reports source: null and origin: '' for window.postMessage, so dispatch the
    // request with the field values a real same-window sender produces in a browser.
    window.dispatchEvent(
      new MessageEvent('message', {
        data: request,
        source: window,
        origin: window.location.origin
      })
    )
  })
}

function awaitToolsChanged(): Promise<string> {
  return new Promise(function awaitAnnouncement(resolve, reject) {
    const timer = setTimeout(function timeout() {
      window.removeEventListener('message', onAnnouncement)
      reject(new Error('No tools-changed announcement arrived.'))
    }, 1000)
    function onAnnouncement(event: MessageEvent) {
      const data = event.data as PageBridgeMessage
      if (data?.protocol !== PAGE_BRIDGE_PROTOCOL || data.kind !== 'tools-changed') return
      clearTimeout(timer)
      window.removeEventListener('message', onAnnouncement)
      resolve(data.revision)
    }
    window.addEventListener('message', onAnnouncement)
  })
}

function dispatchAsSameWindow(data: unknown): void {
  window.dispatchEvent(
    new MessageEvent('message', { data, source: window, origin: window.location.origin })
  )
}

function countingTool(name: string, output: Record<string, unknown> = { done: true }) {
  let calls = 0
  const tool: WebMCPTool & { calls: () => number } = Object.assign(
    defineTool({
      name,
      description: `Test tool ${name}.`,
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false
      },
      execute() {
        calls++
        return output
      }
    }),
    { calls: () => calls }
  )
  return tool
}

afterEach(function resetBridge() {
  clearToolsForTest()
  setConfirmationHandler(undefined)
})

describe('installPageBridge', () => {
  it('answers discover with the available tools and a revision', async () => {
    const bridge = installPageBridge()
    registerTool(countingTool('list_inventory'))

    const reply = await sendRequest({
      protocol: PAGE_BRIDGE_PROTOCOL,
      kind: 'discover',
      requestId: 'discover-1'
    })

    expect(reply.kind).toBe('catalog-reply')
    if (reply.kind !== 'catalog-reply') return
    expect(reply.catalog.revision).toMatch(/^.+:\d+$/)
    expect(reply.catalog.tools).toEqual([
      {
        name: 'list_inventory',
        description: 'Test tool list_inventory.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false
        }
      }
    ])
    bridge.uninstall()
  })

  it('answers discover with an empty catalog when no tools are registered', async () => {
    const bridge = installPageBridge()

    const reply = await sendRequest({
      protocol: PAGE_BRIDGE_PROTOCOL,
      kind: 'discover',
      requestId: 'discover-empty'
    })

    expect(reply.kind).toBe('catalog-reply')
    if (reply.kind !== 'catalog-reply') return
    expect(reply.catalog.tools).toEqual([])
    bridge.uninstall()
  })

  it('executes an invoked tool through the fallback registry and returns its output', async () => {
    const bridge = installPageBridge()
    const tool = countingTool('select_item', { selection: 'Milk' })
    registerTool(tool)

    const reply = await sendRequest({
      protocol: PAGE_BRIDGE_PROTOCOL,
      kind: 'invoke',
      requestId: 'invoke-1',
      name: 'select_item',
      input: {}
    })

    expect(reply).toEqual({
      protocol: PAGE_BRIDGE_PROTOCOL,
      kind: 'invoke-reply',
      requestId: 'invoke-1',
      status: 'result',
      output: { selection: 'Milk' }
    })
    expect(tool.calls()).toBe(1)
    bridge.uninstall()
  })

  it('returns an error reply for an unknown tool', async () => {
    const bridge = installPageBridge()

    const reply = await sendRequest({
      protocol: PAGE_BRIDGE_PROTOCOL,
      kind: 'invoke',
      requestId: 'invoke-missing',
      name: 'not_registered',
      input: {}
    })

    expect(reply.kind).toBe('invoke-reply')
    if (reply.kind !== 'invoke-reply' || reply.status !== 'error') return
    expect(reply.error).toContain('not registered')
    bridge.uninstall()
  })

  it('returns an error reply when the confirmation handler blocks the action', async () => {
    const bridge = installPageBridge()
    registerTool(
      defineTool({
        name: 'delete_everything',
        description: 'A mutating tool.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false
        },
        confirmation: { reason: 'Delete everything?' },
        execute() {
          return { deleted: true }
        }
      })
    )
    setConfirmationHandler(async function blockEverything() {
      return false
    })

    const reply = await sendRequest({
      protocol: PAGE_BRIDGE_PROTOCOL,
      kind: 'invoke',
      requestId: 'invoke-blocked',
      name: 'delete_everything',
      input: {}
    })

    expect(reply.kind).toBe('invoke-reply')
    if (reply.kind !== 'invoke-reply' || reply.status !== 'error') return
    expect(reply.error).toBe('Delete everything?')
    bridge.uninstall()
  })

  it('delivers a framework-proxy output as plain JSON', async () => {
    const bridge = installPageBridge()
    registerTool(
      defineTool({
        name: 'reactive_tool',
        description: 'Returns a Proxy like framework-reactive state.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false
        },
        execute() {
          // window.postMessage rejects Proxy objects; the bridge must unwrap them.
          return new Proxy({ selection: 'Milk' }, {})
        }
      })
    )

    const reply = await sendRequest({
      protocol: PAGE_BRIDGE_PROTOCOL,
      kind: 'invoke',
      requestId: 'invoke-proxy',
      name: 'reactive_tool',
      input: {}
    })

    expect(reply).toEqual({
      protocol: PAGE_BRIDGE_PROTOCOL,
      kind: 'invoke-reply',
      requestId: 'invoke-proxy',
      status: 'result',
      output: { selection: 'Milk' }
    })
    bridge.uninstall()
  })

  it('replies with a result that carries no output for a void tool', async () => {
    const bridge = installPageBridge()
    registerTool(
      defineTool({
        name: 'clear_log',
        description: 'A tool that returns nothing.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false
        },
        execute() {
          return undefined
        }
      })
    )

    const reply = await sendRequest({
      protocol: PAGE_BRIDGE_PROTOCOL,
      kind: 'invoke',
      requestId: 'invoke-void',
      name: 'clear_log',
      input: {}
    })

    expect(reply.kind).toBe('invoke-reply')
    if (reply.kind !== 'invoke-reply') return
    expect(reply.status).toBe('result')
    expect(reply).toEqual({
      protocol: PAGE_BRIDGE_PROTOCOL,
      kind: 'invoke-reply',
      requestId: 'invoke-void',
      status: 'result'
    })
    bridge.uninstall()
  })

  it('replies with an error when the output cannot be serialized', async () => {
    const bridge = installPageBridge()
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    registerTool(
      defineTool({
        name: 'cyclic_tool',
        description: 'Returns a value JSON cannot carry.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false
        },
        execute() {
          return cyclic
        }
      })
    )

    const reply = await sendRequest({
      protocol: PAGE_BRIDGE_PROTOCOL,
      kind: 'invoke',
      requestId: 'invoke-cyclic',
      name: 'cyclic_tool',
      input: {}
    })

    expect(reply.kind).toBe('invoke-reply')
    if (reply.kind !== 'invoke-reply' || reply.status !== 'error') return
    expect(reply.error).toBe('Tool result could not be delivered.')
    bridge.uninstall()
  })

  it('aborts an in-flight invocation on cancel', async () => {
    const bridge = installPageBridge()
    let aborted = false
    registerTool(
      defineTool({
        name: 'slow_tool',
        description: 'A tool that waits for cancellation.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false
        },
        async execute(_input, context) {
          await new Promise<void>(function waitForever(resolve, reject) {
            context.signal?.addEventListener('abort', function onAbort() {
              aborted = true
              reject(new Error('cancelled'))
            })
          })
          return {}
        }
      })
    )

    const invokeReply = sendRequest(
      {
        protocol: PAGE_BRIDGE_PROTOCOL,
        kind: 'invoke',
        requestId: 'invoke-slow',
        name: 'slow_tool',
        input: {}
      },
      'invoke-reply'
    )
    const cancelReply = await sendRequest({
      protocol: PAGE_BRIDGE_PROTOCOL,
      kind: 'cancel',
      requestId: 'invoke-slow'
    })

    expect(cancelReply.kind).toBe('cancel-reply')
    const reply = await invokeReply
    expect(reply.kind).toBe('invoke-reply')
    if (reply.kind !== 'invoke-reply' || reply.status !== 'error') return
    expect(reply.error).toBeDefined()
    expect(aborted).toBe(true)
    bridge.uninstall()
  })

  it('announces registry changes with a bumped revision', async () => {
    const bridge = installPageBridge()
    const firstAnnouncement = awaitToolsChanged()
    registerTool(countingTool('first_tool'))
    const firstRevision = await firstAnnouncement

    const secondAnnouncement = awaitToolsChanged()
    registerTool(countingTool('second_tool'))
    const secondRevision = await secondAnnouncement

    expect(firstRevision).toMatch(/^.+:\d+$/)
    expect(secondRevision).not.toBe(firstRevision)

    const reply = await sendRequest({
      protocol: PAGE_BRIDGE_PROTOCOL,
      kind: 'discover',
      requestId: 'discover-after-change'
    })
    expect(reply.kind).toBe('catalog-reply')
    if (reply.kind !== 'catalog-reply') return
    expect(reply.catalog.revision).toBe(secondRevision)
    expect(reply.catalog.tools.map((tool) => tool.name)).toEqual(['first_tool', 'second_tool'])
    bridge.uninstall()
  })

  it('ignores foreign protocols, malformed payloads, and other event sources', async () => {
    const bridge = installPageBridge()

    const ignored = sendRequest({
      protocol: 'some-other-protocol',
      kind: 'discover',
      requestId: 'never-answered'
    }).then(
      function unexpectedReply() {
        throw new Error('The bridge answered a foreign protocol.')
      },
      function timeout() {
        return 'ignored as expected'
      }
    )

    dispatchAsSameWindow({ protocol: 'another-one', kind: 'discover', requestId: 'x' })
    dispatchAsSameWindow('not an object')
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { protocol: PAGE_BRIDGE_PROTOCOL, kind: 'discover', requestId: 'forged' },
        source: null,
        origin: window.location.origin
      })
    )

    expect(await ignored).toBe('ignored as expected')
    bridge.uninstall()
  })

  it('stops listening after uninstall and can be installed again', async () => {
    const first = installPageBridge()
    first.uninstall()

    const ignored = sendRequest({
      protocol: PAGE_BRIDGE_PROTOCOL,
      kind: 'discover',
      requestId: 'after-uninstall'
    }).then(
      function unexpectedReply() {
        throw new Error('The bridge answered after uninstall.')
      },
      function timeout() {
        return 'ignored as expected'
      }
    )
    expect(await ignored).toBe('ignored as expected')

    const second = installPageBridge()
    registerTool(countingTool('after_reinstall'))
    const reply = await sendRequest({
      protocol: PAGE_BRIDGE_PROTOCOL,
      kind: 'discover',
      requestId: 'discover-reinstalled'
    })
    expect(reply.kind).toBe('catalog-reply')
    second.uninstall()
  })

  it('is idempotent: a second install shares one listener', async () => {
    const first = installPageBridge()
    const second = installPageBridge()

    const announcement = awaitToolsChanged()
    registerTool(countingTool('idempotent_tool'))
    const revision = await announcement

    expect(revision).toMatch(/^.+:\d+$/)
    first.uninstall()

    const ignored = sendRequest({
      protocol: PAGE_BRIDGE_PROTOCOL,
      kind: 'discover',
      requestId: 'after-shared-uninstall'
    }).then(
      function unexpectedReply() {
        throw new Error('The bridge answered after shared uninstall.')
      },
      function timeout() {
        return 'ignored as expected'
      }
    )
    expect(await ignored).toBe('ignored as expected')
    second.uninstall()
  })
})
