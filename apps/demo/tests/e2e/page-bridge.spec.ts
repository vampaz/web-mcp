import { expect, test } from '@playwright/test'

// These requests run in the page like any embedded agent would: no test hooks.
const PROTOCOL = 'webmcp-kit-bridge/v1'

test.beforeEach(function installSender({ page }) {
  void page.addInitScript(function defineSender() {
    window.sendBridgeMessage = function sendBridgeMessage(request) {
      return new Promise(function awaitReply(resolve) {
        const timer = setTimeout(function timeout() {
          window.removeEventListener('message', onReply)
          resolve(undefined)
        }, 5000)
        function onReply(event: MessageEvent) {
          const data = event.data as Record<string, unknown> | null
          if (
            data?.protocol !== 'webmcp-kit-bridge/v1' ||
            data.requestId !== (request as { requestId: string }).requestId
          )
            return
          // The page's own request echo reaches this listener too; only accept replies.
          if (data.kind === 'discover' || data.kind === 'invoke' || data.kind === 'cancel') return
          clearTimeout(timer)
          window.removeEventListener('message', onReply)
          resolve(data)
        }
        window.addEventListener('message', onReply)
        window.postMessage(request, window.location.origin)
      })
    }
  })
})

test('the page bridge serves tools and invocations without native WebMCP', async function testBridge({
  page
}) {
  await page.goto('/?mode=core')
  await expect(page.locator('#counter')).toHaveText('0')

  const catalog = await page.evaluate(async function discover() {
    const reply = await window.sendBridgeMessage({
      protocol: 'webmcp-kit-bridge/v1',
      kind: 'discover',
      requestId: 'discover-1'
    })
    if (reply?.kind !== 'catalog-reply') throw new Error(`Unexpected discover reply: ${reply}`)
    return reply.catalog as { revision: string; tools: { name: string }[] }
  })

  expect(catalog.revision).toMatch(/^.+:\d+$/)
  expect(catalog.tools.map((tool) => tool.name)).toEqual(['read_counter', 'set_counter'])

  const read = await page.evaluate(async function readCounter() {
    const reply = await window.sendBridgeMessage({
      protocol: 'webmcp-kit-bridge/v1',
      kind: 'invoke',
      requestId: 'invoke-read',
      name: 'read_counter',
      input: {}
    })
    if (reply?.kind !== 'invoke-reply' || reply.status !== 'result')
      throw new Error(`Unexpected invoke reply: ${reply}`)
    return reply.output
  })
  expect(read).toEqual({ value: 0 })

  const written = page.evaluate(async function writeCounter() {
    const reply = await window.sendBridgeMessage({
      protocol: 'webmcp-kit-bridge/v1',
      kind: 'invoke',
      requestId: 'invoke-write',
      name: 'set_counter',
      input: { value: 7 }
    })
    if (reply?.kind !== 'invoke-reply' || reply.status !== 'result')
      throw new Error(`Unexpected invoke reply: ${reply}`)
    return reply.output
  })
  // The website's own approval dialog still gates the mutating tool.
  await expect(page.locator('#approval-action')).toContainText('New value: 7')
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  expect(await written).toEqual({ value: 7 })
  await expect(page.locator('#counter')).toHaveText('7')
})

test('an unknown tool reports an error without touching the page', async function testUnknownTool({
  page
}) {
  await page.goto('/?mode=core')
  await expect(page.locator('#counter')).toHaveText('0')

  const reply = await page.evaluate(function invokeMissing() {
    return window.sendBridgeMessage({
      protocol: 'webmcp-kit-bridge/v1',
      kind: 'invoke',
      requestId: 'invoke-missing',
      name: 'not_a_tool',
      input: {}
    })
  })

  expect(reply).toMatchObject({
    protocol: PROTOCOL,
    kind: 'invoke-reply',
    requestId: 'invoke-missing',
    status: 'error'
  })
  await expect(page.locator('#counter')).toHaveText('0')
})

declare global {
  interface Window {
    sendBridgeMessage: (
      request: Record<string, unknown>
    ) => Promise<Record<string, unknown> | undefined>
  }
}
