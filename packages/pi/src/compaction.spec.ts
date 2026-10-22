// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { createResolver, validateJsonValue, type ToolResolver } from '@vampaz/webmcp-kit'
import { summarizePiHistory } from './compaction'

afterEach(function cleanup() {
  vi.unstubAllGlobals()
})

it.each(['json_schema', 'json_object', 'text'] as const)(
  'summarizes large history through bounded %s requests without offering application actions',
  async function test(responseFormat) {
    const bodies: string[] = []
    vi.stubGlobal('fetch', async function summarize(_url: string, options: RequestInit) {
      const body = String(options.body)
      bodies.push(body)
      expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(8192)
      const request = JSON.parse(body)
      const prompt = request.messages[1].content as string
      expect(request.messages[0].content).toContain('Summarize the supplied conversation')
      expect(prompt).not.toContain('Choose only the next unfinished action')
      expect(prompt).not.toContain('needs_clarification')
      expect(prompt).not.toContain('no_tools_match')
      expect(prompt).toContain('Completed actions must stay completed')
      expect(prompt).not.toContain('"name":"accept_proposal"')
      const checkpoint = {
        toolName: 'pi_reply',
        input: {
          text: 'Goal: finish category C. Proposal p-1 saved; never replay it. Continue with p-2.'
        },
        confidence: 1,
        reason: 'History checkpoint'
      }
      const structured = responseFormat === 'json_schema'
      const schema = structured
        ? request.response_format.json_schema.schema
        : JSON.parse(prompt.split('\n\n').at(-1)!)
      expect(validateJsonValue(structured ? { action: checkpoint } : checkpoint, schema)).toEqual(
        []
      )
      for (const toolName of ['needs_clarification', 'no_tools_match', 'accept_proposal']) {
        const outcome = { ...checkpoint, toolName, input: {} }
        expect(validateJsonValue(structured ? { action: outcome } : outcome, schema)).not.toEqual(
          []
        )
      }
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify(structured ? { action: checkpoint } : checkpoint)
            }
          }
        ]
      })
    })
    const resolver = await createResolver({
      provider: 'openai-compatible',
      baseUrl: 'https://resolver.test/v1',
      model: 'fixture',
      responseFormat
    })
    const summary = await summarizePiHistory(
      resolver,
      [
        {
          role: 'user',
          content: 'FIRST-ID-p-1 ' + 'Evidence \\" 🧾 '.repeat(1200) + ' LAST-ID-p-2',
          timestamp: 0
        }
      ],
      'Accept category C',
      new AbortController().signal,
      8192,
      undefined,
      { contextTokens: 32_768, timeoutMs: 120_000 }
    )

    expect(bodies.length).toBeGreaterThan(1)
    expect(bodies[0]).toContain('FIRST-ID-p-1')
    expect(bodies.at(-1)).toContain('LAST-ID-p-2')
    expect(
      bodies.slice(1).every(function checkpoint(body) {
        return body.includes('Proposal p-1 saved')
      })
    ).toBe(true)
    expect(summary).toContain('Continue with p-2')
  }
)

it('does not summarize system-only entries or expose their tool catalog', async function test() {
  const resolve = vi.fn()
  const resolver: ToolResolver = {
    name: 'Fixture',
    available: true,
    status: 'ready',
    detail: '',
    capabilities: { conversation: true },
    resolve
  }
  expect(
    await summarizePiHistory(
      resolver,
      [{ role: 'system', content: 'Tool catalog', timestamp: 0 }],
      'Continue',
      new AbortController().signal,
      8192,
      undefined,
      { contextTokens: 32_768, timeoutMs: 120_000 }
    )
  ).toBeUndefined()
  expect(resolve).not.toHaveBeenCalled()
})

it('keeps an earlier checkpoint separate from user history and omits action-selection instructions', async function checkpoint() {
  const resolve = vi.fn<ToolResolver['resolve']>(
    async function summarize(message, _tools, context, options) {
      expect(options).toMatchObject({ singleStep: true, purpose: 'summary' })
      expect(message).not.toContain('ONE next unfinished action')
      expect(context).not.toHaveProperty('piInstructions')
      expect(context).not.toHaveProperty('piConversation')
      expect(context).toMatchObject({
        objective: 'Continue category C',
        previousCheckpoint: 'Confirmed: accept_proposal p-1 succeeded.'
      })
      expect(context?.transcript).toContain('Next evidence')
      expect(context?.transcript).toContain('Local model timed out')
      expect(context?.transcript).toContain('"stopReason":"error"')
      expect(context?.transcript).not.toContain('Confirmed:')
      return {
        toolName: 'pi_reply',
        input: { text: 'p-1 saved. Continue category C.' },
        confidence: 1,
        reason: 'Checkpoint'
      }
    }
  )
  await summarizePiHistory(
    {
      name: 'Fixture',
      available: true,
      status: 'ready',
      detail: '',
      capabilities: { conversation: true },
      resolve
    },
    [
      { role: 'user', content: 'Next evidence', timestamp: 0 },
      {
        role: 'assistant',
        content: [],
        api: 'webmcp',
        provider: 'fixture',
        model: 'fixture',
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
        },
        timestamp: 0,
        stopReason: 'error',
        errorMessage: 'Local model timed out'
      }
    ],
    'Continue category C',
    new AbortController().signal,
    8192,
    {
      role: 'user',
      content:
        'The conversation history before this point was compacted into the following summary:\n\n<summary>\nConfirmed: accept_proposal p-1 succeeded.\n</summary>',
      timestamp: 0
    },
    { contextTokens: 32_768, timeoutMs: 120_000 }
  )
  expect(resolve).toHaveBeenCalledOnce()
})

it('condenses an oversized checkpoint once before accepting it', async function condense() {
  const resolve = vi
    .fn<ToolResolver['resolve']>()
    .mockResolvedValueOnce({
      toolName: 'pi_reply',
      input: { text: 'x'.repeat(600) },
      confidence: 1,
      reason: 'Too long'
    })
    .mockResolvedValueOnce({
      toolName: 'pi_reply',
      input: { text: 'Proposal p-1 saved; continue p-2.' },
      confidence: 1,
      reason: 'Condensed'
    })
  const result = await summarizePiHistory(
    {
      name: 'Fixture',
      available: true,
      status: 'ready',
      detail: '',
      capabilities: { conversation: true },
      resolve
    },
    [{ role: 'user', content: 'Keep the saved proposal outcome', timestamp: 0 }],
    'Continue category C',
    new AbortController().signal,
    8192,
    undefined,
    { contextTokens: 32_768, timeoutMs: 120_000 }
  )
  expect(result).toContain('p-1 saved')
  expect(resolve).toHaveBeenCalledTimes(2)
  expect(
    resolve.mock.calls.map(function purpose(call) {
      return call[3]?.purpose
    })
  ).toEqual(['summary', 'summary'])
  expect(resolve.mock.calls[1]?.[2]).toMatchObject({ previousCheckpoint: 'x'.repeat(600) })
})

it('shrinks transcript chunks when the provider context is smaller than the byte budget', async function providerOverflow() {
  const attempted: number[] = []
  const resolve = vi.fn<ToolResolver['resolve']>(
    async function summarize(_message, _tools, context) {
      const length = String(context?.transcript).length
      attempted.push(length)
      if (length > 1024)
        throw new Error('tokens to keep from the initial prompt is greater than the context length')
      return {
        toolName: 'pi_reply',
        input: { text: 'Proposal p-1 saved; p-2 pending.' },
        confidence: 1,
        reason: 'Checkpoint'
      }
    }
  )
  expect(
    await summarizePiHistory(
      {
        name: 'Fixture',
        available: true,
        status: 'ready',
        detail: '',
        capabilities: { conversation: true },
        resolve
      },
      [{ role: 'user', content: 'Audit evidence '.repeat(400), timestamp: 0 }],
      'Continue category C',
      new AbortController().signal,
      32768,
      undefined,
      { contextTokens: 32_768, timeoutMs: 120_000 }
    )
  ).toContain('p-1 saved')
  expect(attempted[0]).toBeGreaterThan(1024)
  expect(attempted.at(-1)).toBeLessThanOrEqual(1024)
})

it('does not mistake a provider rate limit for context overflow', async function rateLimit() {
  const resolve = vi
    .fn<ToolResolver['resolve']>()
    .mockRejectedValue(new Error('Rate limit: too many tokens. Wait before trying again.'))
  await expect(
    summarizePiHistory(
      {
        name: 'Fixture',
        available: true,
        status: 'ready',
        detail: '',
        capabilities: { conversation: true },
        resolve
      },
      [{ role: 'user', content: 'Audit evidence', timestamp: 0 }],
      'Continue category C',
      new AbortController().signal,
      8192,
      undefined,
      { contextTokens: 32_768, timeoutMs: 120_000 }
    )
  ).rejects.toThrow('Rate limit')
  expect(resolve).toHaveBeenCalledOnce()
})

it.each(['needs_clarification', 'no_tools_match', 'accept_proposal', 'oversized'])(
  'rejects an unusable checkpoint (%s)',
  async function test(kind) {
    const resolver: ToolResolver = {
      name: 'Fixture',
      available: true,
      status: 'ready',
      detail: '',
      capabilities: { conversation: true },
      async resolve(_message, tools) {
        expect(
          tools.map(function name(tool) {
            return tool.name
          })
        ).toEqual(['pi_reply'])
        return {
          toolName: kind === 'oversized' ? 'pi_reply' : kind,
          input: { text: 'x'.repeat(8192) },
          confidence: 1,
          reason: 'Not a checkpoint'
        }
      }
    }
    await expect(
      summarizePiHistory(
        resolver,
        [{ role: 'user', content: 'Remember the saved proposal', timestamp: 0 }],
        'Continue',
        new AbortController().signal,
        8192,
        undefined,
        { contextTokens: 32_768, timeoutMs: 120_000 }
      )
    ).rejects.toThrow()
  }
)
