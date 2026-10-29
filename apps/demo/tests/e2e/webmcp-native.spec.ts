import { expect, test } from '@playwright/test'

test('uses real native discovery and invocation through the application pipeline', async function native({
  page
}) {
  await page.goto('/?mode=core')
  await expect(page.locator('#model-status')).toHaveText('Native WebMCP available')
  const names = await page.evaluate(async function discover() {
    const modelContext = (
      document as unknown as { modelContext: { getTools(): Promise<{ name: string }[]> } }
    ).modelContext
    return (await modelContext.getTools()).map(function name(tool) {
      return tool.name
    })
  })
  expect(names).toContain('read_counter')
  const result = await page.evaluate(async function invoke() {
    const api = (
      document as unknown as {
        modelContext: {
          getTools(): Promise<{ name: string }[]>
          executeTool(tool: unknown, input: unknown): Promise<unknown>
        }
      }
    ).modelContext
    return api.executeTool(
      (await api.getTools()).find(function selected(tool) {
        return tool.name === 'read_counter'
      }),
      {}
    )
  })
  expect(JSON.parse(String(result))).toEqual({ value: 0 })
})

test('native cancellation reaches the pending application approval', async function cancel({
  page
}) {
  await page.goto('/?mode=core')
  await page.evaluate(async function invoke() {
    const api = (
      document as unknown as {
        modelContext: {
          getTools(): Promise<{ name: string }[]>
          executeTool(
            tool: unknown,
            input: unknown,
            options: { signal: AbortSignal }
          ): Promise<unknown>
        }
      }
    ).modelContext
    const tool = (await api.getTools()).find(function selected(tool) {
      return tool.name === 'set_counter'
    })
    const controller = new AbortController()
    Object.assign(window, {
      cancelNative() {
        controller.abort()
      }
    })
    void api
      .executeTool(tool, { value: 7 }, { signal: controller.signal })
      .catch(function cancelled() {})
  })
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.evaluate(function cancel() {
    ;(window as unknown as { cancelNative(): void }).cancelNative()
  })
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.locator('#counter')).toHaveText('0')
})

test('native agents receive actionable validation errors without changing the application', async ({
  page
}) => {
  await page.goto('/?mode=core')
  await expect(page.locator('#model-status')).toHaveText('Native WebMCP available')
  const result = await page.evaluate(async () => {
    const api = (
      document as unknown as {
        modelContext: {
          getTools(): Promise<{ name: string }[]>
          executeTool(tool: unknown, input: unknown): Promise<unknown>
        }
      }
    ).modelContext
    return api.executeTool(
      (await api.getTools()).find((tool) => tool.name === 'set_counter'),
      { value: 'seven' }
    )
  })
  expect(JSON.parse(String(result))).toMatchObject({
    isError: true,
    status: 'error',
    code: 'invalid_input',
    error: expect.stringContaining('/value')
  })
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.locator('#counter')).toHaveText('0')
})
