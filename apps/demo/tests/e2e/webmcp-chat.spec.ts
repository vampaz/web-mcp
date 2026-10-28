import { expect, test, type Locator } from '@playwright/test'
import type { PiSnapshot, PiTurnOutcome } from '@vampaz/webmcp-kit/pi'
import type { WebMCPChatElement } from '@vampaz/webmcp-kit/chat'

test('sends, confirms, re-resolves, and restores dialogue without replay', async function conversation({
  page
}) {
  await page.goto('/?mode=chat')
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('set 7')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(page.locator('#counter')).toHaveText('7')
  await expectIdle(page.locator('webmcp-chat'))
  await expect(page.locator('webmcp-chat')).toContainText('Counter: 7')
  await expect(page.locator('webmcp-chat img')).toHaveCount(0)
  await expect(page.locator('webmcp-chat details')).not.toHaveAttribute('open')
  await page.reload()
  await expect(page.locator('webmcp-chat')).toContainText('Counter: 7')
  await expect(page.locator('#counter')).toHaveText('0')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.getByRole('button', { name: 'New chat', exact: true }).click()
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
  await expectIdle(chats.first())
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

test('stops resolving and reports a failed provider without a fallback', async function faults({
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
  await expectIdle(chat)
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
      controller: {
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
        async refresh() {},
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
  await expectIdle(chat)
  await expect(chat.getByRole('log').locator('.working')).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Outside chat' })).toBeFocused()
  await expect(input).toHaveValue('My next question')
})

for (const mode of ['inline', 'popup'] as const) {
  test(`keeps the header and composer visible with many suggestions in ${mode} mode`, async function suggestions({
    page
  }) {
    await page.goto(`/?mode=chat&presentation=${mode}`)
    const chat = page.locator('webmcp-chat')
    if (mode === 'popup') await chat.getByRole('button', { name: 'Open Assistant' }).click()
    await expectIdle(chat)
    await chat.evaluate(function configure(element, mode) {
      if (mode === 'inline') (element as HTMLElement).style.inlineSize = '24rem'
      let snapshot: PiSnapshot = { state: 'idle', messages: [] }
      let notify: (snapshot: PiSnapshot) => void
      ;(element as WebMCPChatElement).configure({
        mode,
        controller: {
          getSnapshot: () => snapshot,
          subscribe(listener) {
            notify = listener
            listener(snapshot)
            return function remove() {}
          },
          async send() {
            snapshot = {
              state: 'idle',
              messages: [{ id: '1', role: 'user', text: 'Long message. '.repeat(120) }]
            }
            notify(snapshot)
            return { status: 'completed' }
          },
          async stop() {},
          async clear() {
            snapshot = { state: 'idle', messages: [] }
            notify(snapshot)
          },
          async refresh() {},
          async destroy() {}
        },
        suggestedPrompts: Array.from({ length: 15 }, (_, index) => `Suggested action ${index + 1}`)
      })
    }, mode)
    const log = chat.locator('.transcript')
    const panel = chat.locator('.panel')
    const header = chat.locator('header')
    const input = chat.getByRole('textbox', { name: 'Message', exact: true })
    await expect(log.getByRole('button', { name: 'Suggested action 1', exact: true })).toBeVisible()
    await expect(chat.locator('.jump-latest')).toBeHidden()
    expect(await log.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
    expect(await log.evaluate((element) => element.scrollTop)).toBe(0)
    expect(await panel.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(
      true
    )
    await panel.scrollIntoViewIfNeeded()
    const before = (await header.boundingBox())!
    const composerBefore = (await chat.locator('.composer').boundingBox())!
    await log.getByRole('button', { name: 'Suggested action 15' }).focus()
    expect(await log.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    expect((await header.boundingBox())!.y).toBeCloseTo(before.y, 1)
    expect((await chat.locator('.composer').boundingBox())!.y).toBeCloseTo(composerBefore.y, 1)
    expect(await panel.evaluate((element) => element.scrollTop)).toBe(0)
    const panelBox = (await panel.boundingBox())!
    const inputBox = (await input.boundingBox())!
    expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height)
    await page.keyboard.press('Enter')
    await expect(input).toHaveValue('Suggested action 15')
    await expect(input).toBeFocused()
    await input.press('Enter')
    await expect(chat.locator('ol li')).toHaveCount(1)
    expect(await log.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await chat.getByRole('button', { name: 'New chat' }).click()
    await expect(chat.locator('ol li')).toHaveCount(0)
    expect(await log.evaluate((element) => element.scrollTop)).toBe(0)
  })

  test(`follows the first turn with overflowing suggestions in ${mode} mode`, async function firstTurn({
    page
  }) {
    await page.goto(`/?mode=chat&presentation=${mode}`)
    const chat = page.locator('webmcp-chat')
    if (mode === 'popup') await chat.getByRole('button', { name: 'Open Assistant' }).click()
    await expectIdle(chat)
    await chat.evaluate(function configure(element, mode) {
      if (mode === 'inline') (element as HTMLElement).style.inlineSize = '24rem'
      let snapshot: PiSnapshot = { state: 'idle', messages: [] }
      let notify: (snapshot: PiSnapshot) => void
      ;(element as WebMCPChatElement).configure({
        mode,
        suggestedPrompts: Array.from({ length: 15 }, (_, index) => `Suggested action ${index + 1}`),
        controller: {
          getSnapshot: () => snapshot,
          subscribe(listener) {
            notify = listener
            listener(snapshot)
            return function remove() {}
          },
          send(text) {
            snapshot = { state: 'running', messages: [] }
            notify(snapshot)
            return new Promise(function pending(resolve) {
              element.addEventListener(
                'record-first-message',
                function record() {
                  snapshot = { state: 'running', messages: [{ id: 'q', role: 'user', text }] }
                  notify(snapshot)
                },
                { once: true }
              )
              element.addEventListener(
                'finish-first-turn',
                function finish() {
                  snapshot = {
                    state: 'idle',
                    messages: [
                      ...snapshot.messages,
                      { id: 'a', role: 'assistant', text: 'Reply. '.repeat(300) }
                    ]
                  }
                  notify(snapshot)
                  resolve({ status: 'completed' })
                },
                { once: true }
              )
            })
          },
          async stop() {},
          async clear() {},
          async refresh() {},
          async destroy() {}
        }
      })
    }, mode)
    const transcript = chat.locator('.transcript')
    const input = chat.getByRole('textbox', { name: 'Message', exact: true })
    expect(
      await transcript.evaluate((element) => element.scrollHeight > element.clientHeight)
    ).toBe(true)
    await input.fill('Long first message. '.repeat(100))
    await input.press('Enter')
    await expect(chat.locator('.suggestions')).toBeHidden()
    await expect(chat.locator('.working')).toBeInViewport({ ratio: 1 })
    await chat.dispatchEvent('record-first-message')
    await expect(chat.locator('ol li')).toHaveCount(1)
    await expect(chat.locator('.working')).toBeInViewport({ ratio: 1 })
    await expect(chat.locator('.jump-latest')).toBeHidden()
    await chat.dispatchEvent('finish-first-turn')
    await expectIdle(chat)
    await expect(chat.locator('ol li')).toHaveCount(2)
    await expect
      .poll(() =>
        transcript.evaluate(
          (element) => element.scrollHeight - element.scrollTop - element.clientHeight
        )
      )
      .toBeLessThan(2)
  })

  test(`restores incoming history and resets cleared or replaced conversations in ${mode} mode`, async function controllers({
    page
  }) {
    await page.goto(`/?mode=chat&presentation=${mode}`)
    const chat = page.locator('webmcp-chat')
    if (mode === 'popup') await chat.getByRole('button', { name: 'Open Assistant' }).click()
    await expectIdle(chat)
    await chat.evaluate(function configure(element, mode) {
      if (mode === 'inline') (element as HTMLElement).style.inlineSize = '24rem'
      const chat = element as WebMCPChatElement
      let snapshot: PiSnapshot = { state: 'idle', messages: [] }
      let notify: (snapshot: PiSnapshot) => void
      const saved: PiSnapshot = {
        state: 'idle',
        messages: Array.from({ length: 30 }, (_, index) => ({
          id: String(index),
          role: 'assistant',
          text: `Saved reply ${index}. More content to read.`
        }))
      }
      chat.configure({
        mode,
        suggestedPrompts: Array.from({ length: 15 }, (_, index) => `Suggested action ${index + 1}`),
        controller: {
          getSnapshot: () => snapshot,
          subscribe(listener) {
            notify = listener
            listener(snapshot)
            return function remove() {}
          },
          async send() {
            return { status: 'completed' }
          },
          async stop() {},
          async clear() {},
          async refresh() {},
          async destroy() {}
        }
      })
      const original = chat.controller!
      element.addEventListener('load-history', function load() {
        snapshot = saved
        notify(snapshot)
      })
      element.addEventListener('clear-history', function clear() {
        snapshot = { state: 'idle', messages: [] }
        notify(snapshot)
      })
      element.addEventListener(
        'switch-conversation',
        function switchConversation() {
          const empty: PiSnapshot = { state: 'idle', messages: [] }
          chat.controller = {
            ...original,
            getSnapshot: () => empty,
            subscribe(listener) {
              listener(empty)
              return function remove() {}
            }
          }
        },
        { once: true }
      )
      element.addEventListener(
        'restore-conversation',
        function restore() {
          chat.controller = original
        },
        { once: true }
      )
    }, mode)
    const transcript = chat.locator('.transcript')
    expect(
      await transcript.evaluate((element) => element.scrollHeight > element.clientHeight)
    ).toBe(true)
    expect(await transcript.evaluate((element) => element.scrollTop)).toBe(0)
    await chat.dispatchEvent('load-history')
    await expect(chat.locator('ol li')).toHaveCount(30)
    await expect
      .poll(() =>
        transcript.evaluate(
          (element) => element.scrollHeight - element.scrollTop - element.clientHeight
        )
      )
      .toBeLessThan(2)
    await expect(chat.locator('.jump-latest')).toBeHidden()
    await chat.dispatchEvent('clear-history')
    await expect(chat.locator('ol li')).toHaveCount(0)
    expect(await transcript.evaluate((element) => element.scrollTop)).toBe(0)
    await chat.dispatchEvent('load-history')
    await expect(chat.locator('ol li')).toHaveCount(30)
    expect(await transcript.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await chat.dispatchEvent('switch-conversation')
    await expect(chat.locator('ol li')).toHaveCount(0)
    expect(
      await transcript.evaluate((element) => element.scrollHeight > element.clientHeight)
    ).toBe(true)
    expect(await transcript.evaluate((element) => element.scrollTop)).toBe(0)
    await expect(
      chat.getByRole('button', { name: 'Suggested action 1', exact: true })
    ).toBeInViewport({ ratio: 1 })
    await chat.dispatchEvent('restore-conversation')
    await expect(chat.locator('ol li')).toHaveCount(30)
    await expect
      .poll(() =>
        transcript.evaluate(
          (element) => element.scrollHeight - element.scrollTop - element.clientHeight
        )
      )
      .toBeLessThan(2)
  })
}

test('honors a compact maximum height and keeps controls reachable in a short panel', async function height({
  page
}) {
  await page.setViewportSize({ width: 320, height: 700 })
  await page.goto('/?mode=chat')
  const chat = page.locator('webmcp-chat')
  await expectIdle(chat)
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
      await chat.getByRole('region', { name: 'Conversation' }).evaluate(function readable(element) {
        const style = getComputedStyle(element)
        return element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
      })
    ).toBeGreaterThan(64)
    const input = chat.getByRole('textbox', { name: 'Message', exact: true })
    await input.fill('read')
    await chat.getByRole('button', { name: 'Send', exact: true }).click()
    await expectIdle(chat)
    await expect(chat).toContainText('Fixture answer')
    await chat.getByRole('button', { name: 'New chat', exact: true }).click()
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
  await expectIdle(chat)
  const transcript = chat.getByRole('region', { name: 'Conversation' })
  expect(
    await transcript.evaluate(function scrollable(element) {
      return element.scrollHeight > element.clientHeight
    })
  ).toBe(true)
  await page.reload()
  await expectIdle(chat)
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
  await expectIdle(chat)
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

test('starts a new chat immediately from the keyboard and persists the empty history', async function newChat({
  page
}) {
  await page.goto('/?mode=chat')
  const chat = page.locator('webmcp-chat')
  const input = chat.getByRole('textbox', { name: 'Message', exact: true })
  await input.fill('read')
  await input.press('Enter')
  await expectIdle(chat)
  await input.fill('Previous draft')
  const button = chat.getByRole('button', { name: 'New chat', exact: true })
  await button.focus()
  await button.press('Enter')
  await expect(chat.getByRole('dialog')).toHaveCount(0)
  await expect(chat.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0)
  await expect(chat.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)
  await expect(chat.locator('ol li')).toHaveCount(0)
  await expect(chat.getByRole('status')).toHaveText('New chat started.')
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()
  await page.reload()
  await expectIdle(chat)
  await expect(chat.locator('ol li')).toHaveCount(0)
})

test('keeps a short viewport readable and protects long drafts', async function drafting({ page }) {
  await page.setViewportSize({ width: 390, height: 420 })
  await page.goto('/?mode=chat')
  const chat = page.locator('webmcp-chat')
  const input = chat.getByRole('textbox', { name: 'Message', exact: true })
  await expectIdle(chat)
  expect(
    await chat.getByRole('region', { name: 'Conversation' }).evaluate(function readable(element) {
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
  await expectIdle(chat)
  await expect(chat).toContainText('Fixture answer')
  await expect(chat.locator('li[data-role=assistant]')).not.toContainText('read_counter({})')
})

test('opens saved history at the latest reply when a hidden chat becomes visible', async function hidden({
  page
}) {
  await page.goto('/?mode=chat')
  await expectIdle(page.locator('webmcp-chat'))
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
      controller: {
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
        async refresh() {},
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
  const transcript = page.locator('#saved-chat').getByRole('region', { name: 'Conversation' })
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
  await expectIdle(chat)
  await input.fill('Keep my draft')
  await chat.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByLabel('Presentation', { exact: true }).selectOption('popup')
  const launcher = chat.getByRole('button', { name: 'Open Assistant', exact: true })
  await expect(input).not.toBeVisible()
  await launcher.click()
  const panel = chat.getByRole('dialog', { name: 'Assistant', exact: true })
  await chat.getByRole('button', { name: 'Close settings', exact: true }).click()
  await input.focus()
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
  await expectIdle(chat)
  await chat.getByRole('button', { name: 'New chat', exact: true }).click()
  await expect(chat.locator('ol li')).toHaveCount(0)
  await expect(page.locator('#counter')).toHaveText('7')
  await expect(panel).toBeVisible()
  await chat.getByRole('button', { name: 'Close chat', exact: true }).click()
  await expect(launcher).toBeFocused()
  await launcher.click()
  await chat.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByLabel('Presentation', { exact: true }).selectOption('inline')
  await expect(launcher).not.toBeVisible()
  await chat.getByRole('button', { name: 'Close settings', exact: true }).click()
  await expect(chat.locator('ol li')).toHaveCount(0)
  await expect(input).toBeVisible()
})

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 600, height: 844 }
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

test('opens the popup as a full-width bottom sheet on a phone', async function sheet({ page }) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?mode=chat&presentation=popup')
  const chat = page.locator('webmcp-chat')
  await chat.getByRole('button', { name: 'Open Assistant', exact: true }).click()
  const panel = chat.getByRole('dialog', { name: 'Assistant', exact: true })
  await expect(panel).toBeVisible()
  const bounds = (await panel.boundingBox())!
  expect(bounds.x).toBeLessThan(1)
  expect(bounds.width).toBeGreaterThan(388)
  expect(bounds.y + bounds.height).toBeGreaterThan(843)
  await expect(chat.getByRole('button', { name: 'Move chat', exact: true })).not.toBeVisible()
  await expect(chat.getByRole('button', { name: 'Close chat', exact: true })).toBeVisible()
})

test('drags the popup launcher and panel, resizes by keyboard, and stays within the viewport', async function geometry({
  page
}) {
  await page.setViewportSize({ width: 1100, height: 800 })
  await page.goto('/?mode=chat&presentation=popup')
  const chat = page.locator('webmcp-chat')
  const launcher = chat.getByRole('button', { name: 'Open Assistant', exact: true })
  await expect(launcher).toBeVisible()
  // The default launcher is 52.5px wide; offsetWidth rounds it and must not imply zoom.
  await expect
    .poll(async function launcherContained() {
      const bounds = (await launcher.boundingBox())!
      return (
        bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= 1100 &&
        bounds.y + bounds.height <= 800
      )
    })
    .toBe(true)
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
  // Below 30rem the popup becomes a bottom sheet that spans the viewport width.
  await page.setViewportSize({ width: 320, height: 420 })
  await expect
    .poll(async function contained() {
      const bounds = (await panel.boundingBox())!
      return (
        bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= 320 &&
        bounds.y + bounds.height <= 420
      )
    })
    .toBe(true)
  await chat.getByRole('textbox', { name: 'Message', exact: true }).fill('read')
  await chat.getByRole('button', { name: 'Send', exact: true }).click()
  await expectIdle(chat)
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
    .poll(async function launcherContained() {
      const bounds = (await launcher.boundingBox())!
      return (
        bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= 1100 &&
        bounds.y + bounds.height <= 800
      )
    })
    .toBe(true)
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
  // Moving the element keeps an open popup open.
  await expect(panel).toBeVisible()
  await expect(input).toHaveValue('Draft survives reconnect')
  await expect(chat.getByRole('heading', { name: 'Assistant', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

// Idle chat has no status text and a transcript that is not busy; errors would show status text.
async function expectIdle(chat: Locator) {
  await expect(chat.locator('ol[aria-busy="false"]')).toHaveCount(1)
  await expect(chat.getByRole('status')).toHaveText('')
}
