import { afterEach, expect, it, vi } from 'vitest'
import { registerTool, setConfirmationHandler } from '@vampaz/webmcp-kit'
import { clearToolsForTest } from '../../core/src/registry'
import { createRegistryToolHost } from './tool-host'

afterEach(function cleanup() {
  clearToolsForTest()
  setConfirmationHandler(undefined)
})

it('preserves action metadata and output contracts in the planner catalog', async function test() {
  const tool = {
    name: 'read_status',
    description: 'Read the current operation status.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    outputSchema: { type: 'object', properties: { status: { type: 'string' } } },
    annotations: { readOnlyHint: true, untrustedContentHint: true, consequentialHint: false },
    execute: () => ({ status: 'completed' })
  }
  registerTool(tool)
  const host = createRegistryToolHost()
  const catalog = await host.discover(new AbortController().signal)
  expect(catalog.tools).toEqual([
    {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations: tool.annotations
    }
  ])
})

it('excludes host controls from both discovery and invocation, including after policy changes', async function test() {
  const execute = vi.fn()
  registerTool({
    name: 'clear_chat',
    description: 'Clear this chat.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute
  })
  let allowed = true
  const host = createRegistryToolHost(undefined, { include: () => allowed })
  const signal = new AbortController().signal
  const before = await host.discover(signal)
  allowed = false
  const after = await host.discover(signal)
  expect(after.tools).toEqual([])
  expect(after.revision).not.toBe(before.revision)
  await expect(
    host.invoke({ name: 'clear_chat', input: {}, revision: after.revision }, signal)
  ).rejects.toMatchObject({ code: 'stale_document' })
  expect(execute).not.toHaveBeenCalled()
})

it('forces approval for a call marked after untrusted content', async function test() {
  const execute = vi.fn(function writeCounter() {
    return { value: 1 }
  })
  registerTool({
    name: 'set_counter',
    description: 'Set the visible counter.',
    inputSchema: {
      type: 'object',
      properties: { value: { type: 'integer' } },
      required: ['value'],
      additionalProperties: false
    },
    execute
  })
  const confirm = vi.fn(function deny() {
    return false
  })
  setConfirmationHandler(confirm)
  const host = createRegistryToolHost()
  const signal = new AbortController().signal
  const catalog = await host.discover(signal)
  const phases: string[] = []

  const result = await host.invoke(
    {
      name: 'set_counter',
      input: { value: 1 },
      revision: catalog.revision,
      requireApproval: true
    },
    signal,
    function progress(phase) {
      phases.push(phase)
    }
  )

  expect(result).toMatchObject({
    status: 'blocked',
    code: 'confirmation_denied',
    error: 'This action follows content from an untrusted source.'
  })
  expect(confirm).toHaveBeenCalledWith(
    expect.objectContaining({
      source: 'pi',
      reason: 'This action follows content from an untrusted source.'
    })
  )
  expect(phases).toEqual(['approval', 'running'])
  expect(execute).not.toHaveBeenCalled()
})

it('cancels a forced approval without running the tool', async function test() {
  const execute = vi.fn(function writeCounter() {
    return { value: 1 }
  })
  registerTool({
    name: 'set_counter',
    description: 'Set the visible counter.',
    inputSchema: {
      type: 'object',
      properties: { value: { type: 'integer' } },
      required: ['value'],
      additionalProperties: false
    },
    execute
  })
  setConfirmationHandler(function pending() {
    return new Promise<boolean>(function wait() {})
  })
  const host = createRegistryToolHost()
  const controller = new AbortController()
  const catalog = await host.discover(controller.signal)

  const pending = host.invoke(
    {
      name: 'set_counter',
      input: { value: 1 },
      revision: catalog.revision,
      requireApproval: true
    },
    controller.signal
  )
  controller.abort()

  await expect(pending).resolves.toMatchObject({ status: 'error', code: 'cancelled' })
  expect(execute).not.toHaveBeenCalled()
})
