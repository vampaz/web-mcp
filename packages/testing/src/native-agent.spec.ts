import { afterEach, expect, it, vi } from 'vitest'
import { ToolResolutionValidationError, type ToolResolver } from '@vampaz/webmcp-kit'
import { runNativeWebMCPAgent } from './native-agent'
import type { WebMCPTestingPage } from './playwright'

afterEach(() => {
  Reflect.deleteProperty(document, 'modelContext')
})

it('discovers and executes native tools without a private bridge and records bounded costs', async () => {
  let value = 3
  const read = {
    name: 'read_counter',
    description: 'Read the counter.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  }
  const executeTool = vi.fn(async () => JSON.stringify({ value: value++ }))
  Object.assign(document, { modelContext: { getTools: async () => [read], executeTool } })
  let turn = 0
  const resolver = {
    resolve: vi.fn(async (_message, _tools, context) => {
      expect(context.completedActions).toHaveLength(turn)
      return ++turn <= 2
        ? { toolName: 'read_counter', input: {}, confidence: 1, reason: 'Read the value.' }
        : {
            toolName: 'agent_reply',
            input: { text: 'The value was 4.' },
            confidence: 1,
            reason: 'Done.'
          }
    })
  } as unknown as ToolResolver
  const result = await runNativeWebMCPAgent(fakePage(), {
    resolver,
    message: 'Read twice.',
    maxToolCalls: 2
  })
  expect(result).toMatchObject({
    outcome: 'replied',
    toolCalls: 2,
    repeatedCalls: 1,
    reply: 'The value was 4.'
  })
  expect(result.steps.map((step) => step.result)).toEqual([{ value: 3 }, { value: 4 }])
  expect(result.resultBytes).toBe(22)
  expect(result.resolverInputBytes).toBeGreaterThan(result.catalogBytes)
  expect(executeTool).toHaveBeenCalledTimes(2)
})

it('lets the model explain a partial failure without replaying application actions', async () => {
  const tool = {
    name: 'accept_proposals',
    description: 'Accept proposals.',
    inputSchema: { type: 'object', properties: {} }
  }
  const failure = {
    isError: true,
    code: 'execution_failed',
    details: { accepted: 2, remaining: 1 }
  }
  const executeTool = vi.fn(async () => JSON.stringify(failure))
  Object.assign(document, { modelContext: { getTools: async () => [tool], executeTool } })
  const resolve = vi
    .fn()
    .mockResolvedValueOnce({ toolName: tool.name, input: {}, confidence: 1, reason: 'Accept.' })
    .mockImplementationOnce(async (_message, tools, context) => {
      expect(tools.map((tool: { name: string }) => tool.name)).toEqual(['agent_reply'])
      expect(context.completedActions[0].result).toEqual(failure)
      return {
        toolName: 'agent_reply',
        input: { text: 'Two accepted; one failed.' },
        confidence: 1,
        reason: 'Partial failure.'
      }
    })
  expect(
    await runNativeWebMCPAgent(fakePage(), {
      resolver: { resolve } as unknown as ToolResolver,
      message: 'Accept proposals.'
    })
  ).toMatchObject({ outcome: 'tool_error', toolCalls: 1, reply: 'Two accepted; one failed.' })
  expect(executeTool).toHaveBeenCalledOnce()
})

it('normalizes native string schemas again before execution', async () => {
  const tool = {
    name: 'read',
    description: 'Read.',
    inputSchema: JSON.stringify({ type: 'object', properties: {} })
  }
  const executeTool = vi.fn(async () => JSON.stringify({ value: 1 }))
  Object.assign(document, { modelContext: { getTools: async () => [tool], executeTool } })
  const resolve = vi
    .fn()
    .mockResolvedValueOnce({ toolName: 'read', input: {}, confidence: 1, reason: 'Read.' })
    .mockResolvedValueOnce({
      toolName: 'agent_reply',
      input: { text: 'One.' },
      confidence: 1,
      reason: 'Done.'
    })
  expect(
    await runNativeWebMCPAgent(fakePage(), {
      resolver: { resolve } as unknown as ToolResolver,
      message: 'Read.'
    })
  ).toMatchObject({ outcome: 'replied', toolCalls: 1 })
  expect(executeTool).toHaveBeenCalledOnce()
})

it('does not execute a tool whose contract changed during inference', async () => {
  const tool = {
    name: 'write',
    description: 'Write.',
    inputSchema: { type: 'object', properties: {} }
  }
  const executeTool = vi.fn()
  Object.assign(document, { modelContext: { getTools: async () => [tool], executeTool } })
  const resolve = vi
    .fn()
    .mockImplementationOnce(async () => {
      tool.description = 'A different action.'
      return { toolName: 'write', input: {}, confidence: 1, reason: 'Write.' }
    })
    .mockResolvedValueOnce({
      toolName: 'agent_reply',
      input: { text: 'The tool changed.' },
      confidence: 1,
      reason: 'Stop.'
    })
  expect(
    await runNativeWebMCPAgent(fakePage(), {
      resolver: { resolve } as unknown as ToolResolver,
      message: 'Write.'
    })
  ).toMatchObject({ outcome: 'tool_error', steps: [{ result: { code: 'tool_changed' } }] })
  expect(executeTool).not.toHaveBeenCalled()
})

it('bounds invalid-model correction without executing application actions', async () => {
  Object.assign(document, { modelContext: { getTools: async () => [], executeTool: vi.fn() } })
  const resolve = vi.fn().mockRejectedValue(new ToolResolutionValidationError('Invalid JSON'))
  const report = await runNativeWebMCPAgent(fakePage(), {
    resolver: { resolve } as unknown as ToolResolver,
    message: 'Read.'
  })
  expect(report).toMatchObject({
    outcome: 'resolver_error',
    toolCalls: 0,
    resolverErrors: ['Invalid JSON', 'Invalid JSON']
  })
  expect(resolve).toHaveBeenCalledTimes(2)
})

function fakePage(): WebMCPTestingPage {
  return {
    async evaluate(fn: (arg?: unknown) => unknown, arg?: unknown) {
      return fn(arg)
    },
    async waitForFunction() {
      throw new Error('Not used.')
    }
  } as WebMCPTestingPage
}

it('rejects speculative sequences even if a resolver ignores singleStep', async () => {
  const tool = { name: 'read', description: 'Read.', inputSchema: { type: 'object' } }
  const executeTool = vi.fn()
  Object.assign(document, { modelContext: { getTools: async () => [tool], executeTool } })
  const resolve = vi.fn().mockResolvedValue({
    toolName: 'tool_sequence',
    input: {},
    confidence: 1,
    reason: 'Read twice.',
    steps: [
      { toolName: 'read', input: {} },
      { toolName: 'read', input: {} }
    ]
  })
  const report = await runNativeWebMCPAgent(fakePage(), {
    resolver: { resolve } as unknown as ToolResolver,
    message: 'Read.'
  })
  expect(report).toMatchObject({ outcome: 'resolver_error', toolCalls: 0 })
  expect(resolve).toHaveBeenCalledTimes(2)
  expect(executeTool).not.toHaveBeenCalled()
})
