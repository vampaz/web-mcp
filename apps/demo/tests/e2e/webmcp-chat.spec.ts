import { expect, test } from '@playwright/test'
import type { PiSnapshot, PiTurnOutcome } from '@vampaz/webmcp-kit/pi'
import type { WebMCPChatElement } from '@vampaz/webmcp-kit/chat'

test('sends, confirms, replans, and restores dialogue without replay', async function conversation({
  page
}) {
  await page.goto('/?mode=chat')
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('set 7')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(page.locator('#counter')).toHaveText('7')
  await expect(page.locator('webmcp-chat').getByRole('status')).toHaveText('Ready')
  await expect(page.locator('webmcp-chat')).toContainText('Counter: 7')
  await expect(page.locator('webmcp-chat img')).toHaveCount(0)
  await expect(page.locator('webmcp-chat details')).not.toHaveAttribute('open')
  await page.reload()
  await expect(page.locator('webmcp-chat')).toContainText('Counter: 7')
  await expect(page.locator('#counter')).toHaveText('0')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.getByRole('button', { name: 'Clear chat', exact: true }).click()
  await page.getByRole('button', { name: 'Delete conversation', exact: true }).click()
  await expect(page.locator('webmcp-chat ol li')).toHaveCount(0)
})

test('denies without a follow-up model call and keeps the page unchanged', async function denied({
  page
}) {
  await page.goto('/?mode=chat')
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('set 12')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await page.getByRole('button', { name: 'Deny', exact: true }).click()
  await expect(page.locator('webmcp-chat').getByRole('status')).toContainText(
    'Change the application counter?'
  )
  await expect(page.locator('#counter')).toHaveText('0')
  await expect(page.locator('webmcp-chat')).not.toContainText('Fixture answer')
})

test('supports keyboard, narrow layouts, and distinct controls in two instances', async function accessibility({
  page
}) {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/?mode=chat&multiple')
  const chats = page.locator('webmcp-chat')
  await expect(chats).toHaveCount(2)
  const first = chats.first().getByRole('textbox', { name: 'Message', exact: true })
  await first.fill('read')
  await first.press('Shift+Enter')
  await expect(first).toHaveValue('read\n')
  await first.press('Enter')
  await expect(chats.first().getByRole('status')).toHaveText('Ready')
  await expect(first).toBeFocused()
  expect(
    await page.evaluate(function noOverflow() {
      return document.documentElement.scrollWidth <= innerWidth
    })
  ).toBe(true)
  const ids = await chats.evaluateAll(function ids(elements) {
    return elements.map(function id(element) {
      return element.shadowRoot!.querySelector('textarea')!.id
    })
  })
  expect(new Set(ids).size).toBe(2)
  await page.evaluate(function zoom() {
    document.body.style.zoom = '2'
  })
  expect(
    await page.evaluate(function noOverflow() {
      return document.documentElement.scrollWidth <= innerWidth
    })
  ).toBe(true)
})

test('stops planning and reports a failed provider without a fallback', async function faults({
  page
}) {
  await page.goto('/?mode=chat')
  const input = page.getByRole('textbox', { name: 'Message', exact: true })
  await input.fill('wait')
  await input.press('Enter')
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.locator('webmcp-chat').getByRole('status')).toContainText('interrupted')
  await page.reload()
  await expect(page.locator('webmcp-chat').getByRole('status')).toContainText('interrupted')
  await page.reload()
  await expect(page.locator('webmcp-chat').getByRole('status')).toContainText('interrupted')
  await input.fill('fail')
  await input.press('Enter')
  await expect(page.locator('webmcp-chat').getByRole('status')).toContainText(
    'Fixture provider failed'
  )
  await page.reload()
  await expect(page.locator('webmcp-chat').getByRole('status')).toContainText(
    'last response failed'
  )
  await expect(page.locator('webmcp-chat li').last()).toContainText('Assistant — response failed')
  await expect(page.locator('webmcp-chat li').last().locator('details')).not.toHaveAttribute('open')
})

test('keeps focus outside chat when a pending response arrives', async function focus({ page }) {
  await page.goto('/?mode=chat')
  const chat = page.locator('webmcp-chat')
  await expect(chat.getByRole('status')).toHaveText('Ready')
  await page.evaluate(function configure() {
    const chat = document.querySelector('webmcp-chat') as WebMCPChatElement
    let snapshot: PiSnapshot = { state: 'idle', messages: [] }
    let listener: (snapshot: PiSnapshot) => void
    let complete: (outcome: PiTurnOutcome) => void
    const outside = document.createElement('input')
    outside.setAttribute('aria-label', 'Outside chat')
    const finish = document.createElement('button')
    finish.textContent = 'Finish response'
    finish.onclick = function respond() {
      outside.focus()
      snapshot = {
        state: 'idle',
        messages: [{ id: 'answer', role: 'assistant', text: 'Finished' }]
      }
      listener(snapshot)
      complete({ status: 'completed' })
    }
    chat.after(outside, finish)
    chat.configure({
      harness: {
        getSnapshot() {
          return snapshot
        },
        subscribe(next) {
          listener = next
          next(snapshot)
          return function remove() {}
        },
        send() {
          snapshot = { state: 'running', messages: [] }
          listener(snapshot)
          return new Promise(function pending(resolve) {
            complete = resolve
          })
        },
        async stop() {},
        async clear() {},
        async destroy() {}
      }
    })
  })
  const input = chat.getByRole('textbox', { name: 'Message', exact: true })
  await input.fill('Hello')
  await input.press('Enter')
  await expect(input).toBeFocused()
  await expect(chat.getByRole('log').locator('.working')).toBeVisible()
  await input.fill('My next question')
  await expect(chat.getByRole('button', { name: 'Send', exact: true })).toBeDisabled()
  await page.getByRole('textbox', { name: 'Outside chat' }).fill('Keep typing')
  await page.getByRole('button', { name: 'Finish response' }).click()
  await expect(chat.getByRole('status')).toHaveText('Ready')
  await expect(chat.getByRole('log').locator('.working')).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Outside chat' })).toBeFocused()
  await expect(input).toHaveValue('My next question')
})

test('honors a compact maximum height and keeps controls reachable in a short panel', async function height({
  page
}) {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/?mode=chat')
  const chat = page.locator('webmcp-chat')
  await expect(chat.getByRole('status')).toHaveText('Ready')
  for (const height of [24, 12]) {
    await chat.evaluate(function resize(element, height) {
      ;(element as HTMLElement).style.setProperty('--webmcp-chat-height', `${height}rem`)
    }, height)
    const size = await chat.evaluate(function measure(element) {
      return {
        actual: element.getBoundingClientRect().height,
        maximum: parseFloat(getComputedStyle(element).maxBlockSize)
      }
    })
    expect(size.actual).toBeLessThanOrEqual(size.maximum)
    expect(
      await chat.getByRole('log').evaluate(function readable(element) {
        const style = getComputedStyle(element)
        return element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
      })
    ).toBeGreaterThan(64)
    const input = chat.getByRole('textbox', { name: 'Message', exact: true })
    await input.fill('read')
    await chat.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(chat.getByRole('status')).toHaveText('Ready')
    await expect(chat).toContainText('Fixture answer')
    await chat.getByRole('button', { name: 'Clear chat', exact: true }).click()
    await chat.getByRole('button', { name: 'Delete conversation', exact: true }).click()
    await expect(chat.locator('ol li')).toHaveCount(0)
  }
})

test('wraps long text and preserves the reader position when a new message arrives', async function reading({
  page
}) {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/?mode=chat')
  const chat = page.locator('webmcp-chat')
  const input = chat.getByRole('textbox', { name: 'Message', exact: true })
  await input.fill('x'.repeat(15900))
  await input.press('Enter')
  await expect(chat.getByRole('status')).toHaveText('Ready')
  const transcript = chat.getByRole('log', { name: 'Conversation' })
  expect(
    await transcript.evaluate(function scrollable(element) {
      return element.scrollHeight > element.clientHeight
    })
  ).toBe(true)
  await page.reload()
  await expect(chat.getByRole('status')).toHaveText('Ready')
  expect(
    await transcript.evaluate(function latest(element) {
      return element.scrollHeight - element.scrollTop - element.clientHeight
    })
  ).toBeLessThan(2)
  await transcript.evaluate(function readEarlier(element) {
    element.scrollTop = 0
  })
  await input.fill('read')
  await input.press('Enter')
  await expect(chat.getByRole('status')).toHaveText('Ready')
  expect(
    await transcript.evaluate(function position(element) {
      return element.scrollTop
    })
  ).toBe(0)
  await chat.getByRole('button', { name: 'New messages · Jump to latest', exact: true }).click()
  expect(
    await transcript.evaluate(function latest(element) {
      return element.scrollHeight - element.scrollTop - element.clientHeight
    })
  ).toBeLessThan(2)
  await expect(transcript).toBeFocused()
  expect(
    await page.evaluate(function fits() {
      return document.documentElement.scrollWidth <= innerWidth
    })
  ).toBe(true)
})

test('protects history and drafts with a keyboard-accessible clear confirmation', async function clear({
  page
}) {
  await page.goto('/?mode=chat')
  const chat = page.locator('webmcp-chat')
  const input = chat.getByRole('textbox', { name: 'Message', exact: true })
  await input.fill('read')
  await input.press('Enter')
  await expect(chat.getByRole('status')).toHaveText('Ready')
  await input.fill('Keep this draft')
  const clearButton = chat.getByRole('button', { name: 'Clear chat', exact: true })
  await clearButton.click()
  const dialog = chat.getByRole('dialog', { name: 'Clear this conversation?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await dialog.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(clearButton).toBeFocused()
  await expect(chat).toContainText('Fixture answer')
  await clearButton.click()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(chat).toContainText('Fixture answer')
  await clearButton.click()
  await dialog.getByRole('button', { name: 'Delete conversation', exact: true }).click()
  await expect(chat.locator('ol li')).toHaveCount(0)
  await expect(chat.getByRole('status')).toHaveText('Conversation cleared.')
  await expect(input).toHaveValue('Keep this draft')
  await expect(input).toBeFocused()
})

test('keeps a short viewport readable and protects long drafts', async function drafting({ page }) {
  await page.setViewportSize({ width: 390, height: 420 })
  await page.goto('/?mode=chat')
  const chat = page.locator('webmcp-chat')
  const input = chat.getByRole('textbox', { name: 'Message', exact: true })
  await expect(chat.getByRole('status')).toHaveText('Ready')
  expect(
    await chat.getByRole('log').evaluate(function readable(element) {
      const style = getComputedStyle(element)
      return element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
    })
  ).toBeGreaterThan(64)
  await input.fill('An unfinished request')
  await expect(
    chat.getByRole('button', { name: 'Read the counter', exact: true })
  ).not.toBeVisible()
  await input.fill('x'.repeat(16050))
  await expect(input).toHaveValue('x'.repeat(16050))
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(chat.locator('.limit')).toContainText('Shorten your message')
  await expect(chat.getByRole('button', { name: 'Send', exact: true })).toBeDisabled()
  await input.fill('read')
  await input.press('Enter')
  await expect(chat.getByRole('status')).toHaveText('Ready')
  await expect(chat).toContainText('Fixture answer')
  await expect(chat.locator('li[data-role=assistant]')).not.toContainText('read_counter({})')
})

test('opens saved history at the latest reply when a hidden chat becomes visible', async function hidden({
  page
}) {
  await page.goto('/?mode=chat')
  await expect(page.locator('webmcp-chat').getByRole('status')).toHaveText('Ready')
  await page.evaluate(function prepare() {
    const panel = document.createElement('div')
    panel.hidden = true
    const chat = document.createElement('webmcp-chat') as WebMCPChatElement
    chat.id = 'saved-chat'
    const snapshot: PiSnapshot = {
      state: 'idle',
      messages: Array.from({ length: 20 }, function message(_, index) {
        return {
          id: String(index),
          role: 'assistant',
          text: `Saved reply ${index}. More content to read.`
        }
      })
    }
    chat.configure({
      harness: {
        getSnapshot() {
          return snapshot
        },
        subscribe(listener) {
          listener(snapshot)
          return function remove() {}
        },
        async send() {
          return { status: 'completed' }
        },
        async stop() {},
        async clear() {},
        async destroy() {}
      }
    })
    panel.append(chat)
    const show = document.createElement('button')
    show.textContent = 'Open saved conversation'
    show.onclick = function open() {
      panel.hidden = false
    }
    document.querySelector('#example')!.append(show, panel)
  })
  await page.getByRole('button', { name: 'Open saved conversation', exact: true }).click()
  const transcript = page.locator('#saved-chat').getByRole('log')
  await expect(transcript).toBeVisible()
  await expect
    .poll(async function latest() {
      return transcript.evaluate(function distance(element) {
        return element.scrollHeight - element.scrollTop - element.clientHeight
      })
    })
    .toBeLessThan(2)
})

test('switches inline and popup modes while keeping the conversation and draft', async function modes({
  page
}) {
  await page.goto('/?mode=chat')
  const chat = page.locator('webmcp-chat')
  const input = chat.getByRole('textbox', { name: 'Message', exact: true })
  await input.fill('read')
  await input.press('Enter')
  await expect(chat.getByRole('status')).toHaveText('Ready')
  await input.fill('Keep my draft')
  await page.getByLabel('Presentation', { exact: true }).selectOption('popup')
  const launcher = chat.getByRole('button', { name: 'Open Assistant', exact: true })
  await expect(input).not.toBeVisible()
  await launcher.click()
  const panel = chat.getByRole('dialog', { name: 'Assistant', exact: true })
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('Keep my draft')
  await expect(panel).toContainText('Fixture answer')
  await page.getByRole('heading', { name: 'Application counter', exact: true }).click()
  await expect(panel).toBeVisible()
  await input.press('Escape')
  await expect(panel).not.toBeVisible()
  await expect(launcher).toBeFocused()
  await launcher.press('Enter')
  await input.fill('set 7')
  await input.press('Enter')
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(page.locator('#counter')).toHaveText('7')
  await expect(chat.getByRole('status')).toHaveText('Ready')
  await chat.getByRole('button', { name: 'Clear chat', exact: true }).click()
  const clear = chat.getByRole('dialog', { name: 'Clear this conversation?', exact: true })
  await expect(clear).toBeVisible()
  await clear.press('Escape')
  await expect(clear).not.toBeVisible()
  await expect(panel).toBeVisible()
  await chat.getByRole('button', { name: 'Close chat', exact: true }).click()
  await expect(launcher).toBeFocused()
  await page.getByLabel('Presentation', { exact: true }).selectOption('inline')
  await expect(launcher).not.toBeVisible()
  await expect(chat).toContainText('Counter: 7')
  await expect(input).toBeVisible()
})

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 390, height: 844 }
]) {
  test(`restores the popup anchor after resizing at ${viewport.width}px`, async function anchor({
    page
  }) {
    await page.setViewportSize(viewport)
    await page.goto('/?mode=chat&presentation=popup')
    const chat = page.locator('webmcp-chat')
    const launcher = chat.getByRole('button', { name: 'Open Assistant', exact: true })
    await launcher.click()
    const panel = chat.getByRole('dialog', { name: 'Assistant', exact: true })
    const resize = chat.getByRole('button', { name: 'Resize chat', exact: true })
    const original = (await panel.boundingBox())!
    for (let cycle = 0; cycle < 2; cycle++) {
      await resize.click()
      await expect
        .poll(async function expanded() {
          return (await panel.boundingBox())!.height
        })
        .toBeGreaterThan(original.height)
      await resize.click()
      await expect
        .poll(async function anchored() {
          return panel.boundingBox()
        })
        .toEqual(original)
    }
    await chat.getByRole('button', { name: 'Close chat', exact: true }).click()
    await launcher.click()
    await expect
      .poll(async function reopened() {
        return panel.boundingBox()
      })
      .toEqual(original)
  })
}

test('drags the popup launcher and panel, resizes by keyboard, and stays within the viewport', async function geometry({
  page
}) {
  await page.setViewportSize({ width: 1100, height: 800 })
  await page.goto('/?mode=chat&presentation=popup')
  const chat = page.locator('webmcp-chat')
  const launcher = chat.getByRole('button', { name: 'Open Assistant', exact: true })
  await expect(launcher).toBeVisible()
  const start = (await launcher.boundingBox())!
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(start.x - 180, start.y - 140, { steps: 6 })
  await page.mouse.up()
  await expect(launcher).toHaveAttribute('aria-expanded', 'false')
  expect((await launcher.boundingBox())!.x).toBeLessThan(start.x - 100)
  await launcher.click()
  const panel = chat.getByRole('dialog', { name: 'Assistant', exact: true })
  await expect(panel).toBeVisible()
  const beforeMove = (await panel.boundingBox())!
  const move = chat.getByRole('button', { name: 'Move chat', exact: true })
  const handle = (await move.boundingBox())!
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x - 80, handle.y + 50, { steps: 5 })
  await page.mouse.up()
  expect((await panel.boundingBox())!.x).toBeLessThan(beforeMove.x - 50)
  const beforeKey = (await panel.boundingBox())!
  await move.press('ArrowRight')
  expect((await panel.boundingBox())!.x).toBeCloseTo(beforeKey.x + 10, 0)
  const resize = chat.getByRole('button', { name: 'Resize chat', exact: true })
  const small = (await panel.boundingBox())!
  await resize.click()
  expect((await panel.boundingBox())!.width).toBeGreaterThan(small.width)
  await resize.press('ArrowLeft')
  const reduced = (await panel.boundingBox())!
  await resize.press('Shift+ArrowLeft')
  expect((await panel.boundingBox())!.width).toBeCloseTo(reduced.width - 40, 0)
  await page.setViewportSize({ width: 320, height: 420 })
  await expect
    .poll(async function contained() {
      const bounds = (await panel.boundingBox())!
      return (
        bounds.x >= 7 &&
        bounds.y >= 7 &&
        bounds.x + bounds.width <= 313 &&
        bounds.y + bounds.height <= 413
      )
    })
    .toBe(true)
  await chat.getByRole('textbox', { name: 'Message', exact: true }).fill('read')
  await chat.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(chat.getByRole('status')).toHaveText('Ready')
  await chat.getByRole('button', { name: 'Close chat', exact: true }).click()
  await launcher.press('Shift+ArrowLeft')
  await launcher.press('Enter')
  await expect(panel).toBeVisible()
  expect(
    await page.evaluate(function noOverflow() {
      return document.documentElement.scrollWidth <= innerWidth
    })
  ).toBe(true)
})

test('keeps popup controls reachable through clipping, zoom, and reconnect', async function popupLayout({
  page
}) {
  const errors: string[] = []
  page.on('pageerror', function error(error) {
    errors.push(error.message)
  })
  await page.setViewportSize({ width: 1100, height: 800 })
  await page.goto('/?mode=chat&presentation=popup')
  const chat = page.locator('webmcp-chat')
  const launcher = chat.getByRole('button', { name: 'Open Assistant', exact: true })
  await expect(launcher).toBeVisible()
  await chat.evaluate(function clip(element) {
    const parent = element.parentElement!
    parent.style.transform = 'translateZ(0)'
    parent.style.overflow = 'hidden'
    parent.style.height = '1px'
  })
  await launcher.click()
  const panel = chat.getByRole('dialog', { name: 'Assistant', exact: true })
  await expect(panel).toBeVisible()
  await chat.getByRole('button', { name: 'Move chat', exact: true }).press('Shift+ArrowLeft')
  await chat.getByRole('button', { name: 'Move chat', exact: true }).press('Shift+ArrowLeft')
  const before = (await panel.boundingBox())!
  const grip = (await chat.locator('.resize-grip').boundingBox())!
  const gripX = grip.x + grip.width / 2
  const gripY = grip.y + grip.height / 2
  await page.mouse.move(gripX, gripY)
  await page.mouse.down()
  await page.mouse.move(gripX + 60, gripY + 20, { steps: 5 })
  await page.mouse.up()
  expect((await panel.boundingBox())!.width).toBeGreaterThan(before.width + 30)
  await chat.evaluate(function zoom() {
    document.body.style.zoom = '2'
  })
  await expect
    .poll(async function contained() {
      const bounds = (await panel.boundingBox())!
      return (
        bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= 1100 &&
        bounds.y + bounds.height <= 800
      )
    })
    .toBe(true)
  const input = chat.getByRole('textbox', { name: 'Message', exact: true })
  await input.fill('Draft survives reconnect')
  await chat.evaluate(function reconnect(element) {
    const parent = element.parentElement!
    element.remove()
    parent.append(element)
  })
  await expect(panel).not.toBeVisible()
  await launcher.click()
  await expect(input).toHaveValue('Draft survives reconnect')
  await expect(chat.getByRole('heading', { name: 'Assistant', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
