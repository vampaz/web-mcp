import { afterEach, expect, it, vi } from 'vitest'
import { registerTool } from '@vampaz/webmcp-kit'
import { clearToolsForTest } from '../../core/src/registry'
import { createRegistryToolHost } from './tool-host'

afterEach(clearToolsForTest)

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
