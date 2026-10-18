import { expect, test } from '@playwright/test'

test.beforeEach(async function fixture({ page }) {
  await page.goto('/?mode=storage')
  await expect(page.locator('#model-status')).toHaveText('Storage fixture ready')
})

test('commits before display, partitions owners, and can clear or lose storage', async function storage({
  page
}) {
  const result = await page.evaluate(async function exercise() {
    const fixture = window.piStorageFixture
    await fixture.open('one', 'owner-one', 'chat')
    await fixture.send('one', 'Hello')
    const evidence = await fixture.evidence()
    await fixture.destroy('one')
    const restored = await fixture.open('restored', 'owner-one', 'chat')
    const isolated = await fixture.open('other', 'owner-two', 'chat')
    await fixture.clear('restored')
    const cleared = fixture.snapshot('restored')
    await fixture.destroy('restored')
    const empty = await fixture.open('empty', 'owner-one', 'chat')
    await fixture.send('empty', 'Hello again')
    await fixture.destroy('empty')
    await fixture.evict('owner-one', 'chat')
    const evicted = await fixture.open('evicted', 'owner-one', 'chat')
    return { evidence, restored, isolated, cleared, empty, evicted }
  })
  expect(result.evidence.length).toBeGreaterThan(0)
  expect(
    result.evidence.every(function committed(count) {
      return count === true
    })
  ).toBe(true)
  expect(result.restored.messages.length).toBeGreaterThan(0)
  expect(result.isolated.messages).toEqual([])
  expect(result.cleared.messages).toEqual([])
  expect(result.empty.messages).toEqual([])
  expect(result.evicted.messages).toEqual([])
})

test('a second tab cannot read or clear a conversation during another writer', async function contention({
  page,
  context
}) {
  await page.evaluate(async function active() {
    await window.piStorageFixture.open('one', 'owner', 'busy')
    void window.piStorageFixture.send('one', 'wait')
  })
  await expect
    .poll(async function running() {
      return page.evaluate(function state() {
        return window.piStorageFixture.snapshot('one').state
      })
    })
    .toBe('running')
  const second = await context.newPage()
  await second.goto('/?mode=storage')
  await expect(second.locator('#model-status')).toHaveText('Storage fixture ready')
  const result = await second.evaluate(async function blocked() {
    const snapshot = await window.piStorageFixture.open('two', 'owner', 'busy')
    let clear = ''
    try {
      await window.piStorageFixture.clear('two')
    } catch (error) {
      clear = String(error)
    }
    return { snapshot, clear }
  })
  expect(result.snapshot.error?.code).toBe('conversation_busy')
  expect(result.clear).toContain('active operation')
  await page.evaluate(async function stop() {
    await window.piStorageFixture.stop('one')
  })
})

test('reports storage failures and request limits visibly', async function failures({ page }) {
  const result = await page.evaluate(async function exercise() {
    const fixture = window.piStorageFixture
    const unavailable = await fixture.unavailable()
    await fixture.open('limited', 'owner', 'limited', { maxRequestBytes: 1024 })
    const outcome = await fixture.send('limited', 'Hello '.repeat(1000))
    return { unavailable, outcome }
  })
  expect(result.unavailable).toMatchObject({ state: 'error', error: { code: 'storage_failed' } })
  expect(result.outcome).toMatchObject({ status: 'error', error: { code: 'limit_reached' } })
})
