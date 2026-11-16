import { expect, test, type Locator, type Page } from '@playwright/test'

async function waitForDemoProvider(page: Page) {
  await expect(page.locator('#model-status')).toContainText('Test responses')
}

async function expectIdle(chat: Locator) {
  await expect(chat.locator('ol[aria-busy="false"]')).toHaveCount(1)
  await expect(chat.getByRole('status')).toHaveText('')
}

async function expectTouchTarget(locator: Locator) {
  await expect(locator).toBeVisible()
  const box = (await locator.boundingBox())!
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.height).toBeGreaterThanOrEqual(44)
}

test('opens as a bottom sheet with 44px touch targets', async function bottomSheet({ page }) {
  await page.goto('/?mode=chat&presentation=popup')
  const chat = page.locator('webmcp-chat')
  await waitForDemoProvider(page)
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)

  await chat.getByRole('button', { name: 'Open Assistant', exact: true }).tap()
  const panel = chat.getByRole('dialog', { name: 'Assistant', exact: true })
  await expect(panel).toBeVisible()
  const viewport = page.viewportSize()!
  const bounds = (await panel.boundingBox())!
  expect(bounds.x).toBeLessThan(1)
  expect(bounds.width).toBeGreaterThanOrEqual(viewport.width - 1)
  expect(Math.abs(bounds.y + bounds.height - viewport.height)).toBeLessThan(1)
  expect(
    await panel.evaluate(function corners(element) {
      const style = getComputedStyle(element)
      return [style.borderBottomLeftRadius, style.borderBottomRightRadius]
    })
  ).toEqual(['0px', '0px'])
  await expect(chat.getByRole('button', { name: 'Move chat', exact: true })).toBeHidden()

  await expectTouchTarget(chat.getByRole('button', { name: 'New chat', exact: true }))
  await expectTouchTarget(chat.getByRole('button', { name: 'Send', exact: true }))

  const input = chat.getByRole('textbox', { name: 'Message', exact: true })
  await input.fill('read')
  await chat.getByRole('button', { name: 'Send', exact: true }).tap()
  await expectIdle(chat)
  await expectTouchTarget(chat.getByRole('button', { name: 'Copy reply', exact: true }).first())

  await input.fill('wait')
  await chat.getByRole('button', { name: 'Send', exact: true }).tap()
  const stop = chat.getByRole('button', { name: 'Stop', exact: true })
  await expect(stop).toBeVisible()
  await expectTouchTarget(stop)
  await stop.tap()
  await expect(chat.getByRole('status')).toContainText('interrupted')
})

test('keeps Enter for new lines and sends only from the button', async function composer({ page }) {
  await page.goto('/?mode=chat&presentation=popup')
  const chat = page.locator('webmcp-chat')
  await waitForDemoProvider(page)
  await chat.getByRole('button', { name: 'Open Assistant', exact: true }).tap()

  const input = chat.getByRole('textbox', { name: 'Message', exact: true })
  await input.fill('read')
  await input.press('Enter')
  await expect(input).toHaveValue('read\n')
  await expect(chat.locator('ol li')).toHaveCount(0)
  await expect(chat.getByRole('button', { name: 'Send', exact: true })).toBeEnabled()

  await chat.getByRole('button', { name: 'Send', exact: true }).tap()
  await expectIdle(chat)
  await expect(chat.locator('li[data-role=user]')).toContainText('read')
  await expect(chat).toContainText('Fixture answer')
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()
})
