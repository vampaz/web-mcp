import { expect, test } from '@playwright/test'
import type { WebMCPChatElement } from '@vampaz/webmcp-kit/chat'

for (const width of [1280, 390]) {
  test(`large page catalogs do not interrupt each chat message at ${width}px`, async function chat({
    page
  }) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/?mode=chat')
    await expect(page.locator('webmcp-chat ol[aria-busy="false"]')).toHaveCount(1)
    await page.evaluate(async function connect() {
      // @ts-expect-error Vite serves this test fixture from the lab source.
      const { createCompactionFixture } = await import('/src/fixtures/compaction.ts')
      const fixture = await createCompactionFixture(1_050_000)
      const chat = document.querySelector<WebMCPChatElement>('webmcp-chat')!
      await chat.controller?.destroy()
      chat.controller = fixture.controller
      Object.assign(window, { compactionRequests: fixture.requests })
    })
    const chat = page.locator('webmcp-chat')
    const message = chat.getByRole('textbox', { name: 'Message', exact: true })
    for (let turn = 0; turn < 4; turn++) {
      await message.fill('Check this page ' + turn)
      await message.press('Enter')
      await expect(chat.locator('ol[aria-busy="false"]')).toHaveCount(1)
      await expect(chat.getByText('Page checked.', { exact: true })).toHaveCount(turn + 1)
    }
    expect(
      await page.evaluate(
        () => (window as unknown as { compactionRequests: unknown }).compactionRequests
      )
    ).toEqual({ replies: 4, summaries: 0 })
    await expect(message).toBeEnabled()
    await expect(chat.getByText('Summarizing earlier conversation…', { exact: true })).toHaveCount(
      0
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await message.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `test-results/context-chat-${width}.png`, fullPage: true })
  })
}
