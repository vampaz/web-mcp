import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { Type } from '@earendil-works/pi-ai'
import {
  CompactionTask,
  createRegistry,
  defineExtension,
  defineTool,
  Harness,
  hook
} from '@earendil-works/pi-durable'
import type { Conversation, ConversationWatch, ConversationView } from '@earendil-works/pi-durable'
import type {
  PiController,
  PiError,
  PiRuntimeOptions,
  PiSnapshot,
  PiTurnOutcome
} from './interfaces/controller'
import { abortable, jsonBytes, piError, PiFailure } from './errors'
import { createPiModels, piModel } from './model-adapter'
import { piRefreshCatalogToolName, resolvePiRound } from './resolver-adapter'
import { normalizeMessages, lastTurnState, readPiHistory } from './recovery'
import type { PiToolCatalog } from './interfaces/host'
import type { PiActionOutcome } from './interfaces/action-outcome'
import { piSessionKey, resolvePiLimits } from './session'
import { clearPiStorage, openPiStorage } from './storage'
import { piCompactionPolicy, summarizePiHistory } from './compaction'

const context = BACKGROUND_CONTEXT

export async function openRuntime(options: PiRuntimeOptions): Promise<PiController> {
  const key = piSessionKey(options.session)
  const limits = resolvePiLimits(options.limits)
  if (typeof indexedDB === 'undefined' || typeof navigator === 'undefined' || !navigator.locks)
    throw new PiFailure(
      'unsupported',
      'Durable chat requires IndexedDB and Web Locks in a secure browser context.'
    )
  let snapshot: PiSnapshot = { state: 'loading', messages: [] }
  const listeners = new Set<(snapshot: PiSnapshot) => void>()
  let controller: AbortController | undefined
  let active: Promise<PiTurnOutcome> | undefined
  let closed = false
  let clearing = false
  let clearOperation: Promise<void> | undefined

  function publish(next: PiSnapshot) {
    snapshot = structuredClone(next)
    for (const listener of listeners) {
      try {
        listener(structuredClone(snapshot))
      } catch {
        /* A subscriber cannot interrupt persistence. */
      }
    }
  }

  async function withLock<T>(operation: () => Promise<T>): Promise<T> {
    return navigator.locks.request(key, { ifAvailable: true }, async function locked(lock) {
      if (!lock)
        throw new PiFailure(
          'conversation_busy',
          'This conversation is open in an active operation. Wait for the other chat to finish.'
        )
      return operation()
    })
  }

  async function run(text?: string, signal = new AbortController().signal): Promise<PiTurnOutcome> {
    let harness: Harness | undefined
    let conversation: Conversation | undefined
    let watch: ConversationWatch | undefined
    let accepting = false
    let failure: PiError | undefined
    let interrupted = false
    let aborting: Promise<void> | undefined
    let toolCalls = 0
    const completedActions: PiActionOutcome[] = []
    let catalogRefreshed = false
    function abort() {
      accepting = false
      aborting ??= conversation?.abort(context)
    }
    try {
      return await withLock(async function operate() {
        try {
          signal.throwIfAborted()
          let catalog = await abortable(options.host.discover(signal), signal)
          const registry = createRegistry()
          registry.install(
            defineExtension({
              name: 'webmcp-runtime',
              hooks: [
                hook(CompactionTask, {
                  async beforeCompact(compaction, _api, taskContext) {
                    const currentSignal = AbortSignal.any([
                      signal,
                      ...(taskContext.abortSignal ? [taskContext.abortSignal] : [])
                    ])
                    try {
                      if (!accepting)
                        throw new PiFailure('stale_document', 'The turn is no longer active.')
                      const summary = await summarizePiHistory(
                        options.resolver,
                        compaction.entries[0]?.kind === 'pi.compaction'
                          ? compaction.messages.slice(1)
                          : compaction.messages,
                        text ?? '',
                        currentSignal,
                        limits.maxRequestBytes,
                        compaction.entries[0]?.kind === 'pi.compaction'
                          ? compaction.messages[0]
                          : undefined
                      )
                      currentSignal.throwIfAborted()
                      if (summary && compaction.reason === 'overflow') failure = undefined
                      return summary ? { summary } : { decline: true }
                    } catch (error) {
                      failure = piError(error)
                      throw error
                    }
                  }
                })
              ],
              tools: [
                defineTool({
                  name: piRefreshCatalogToolName,
                  description: 'Refresh available tools without invoking an application action.',
                  parameters: Type.Object({}, { additionalProperties: false }),
                  replay: 'unsafe',
                  async execute() {
                    return { output: [{ type: 'text', text: 'Available tools refreshed.' }] }
                  }
                })
              ]
            })
          )
          function installCatalog(roundCatalog: PiToolCatalog) {
            if (roundCatalog.tools.some((tool) => tool.name === piRefreshCatalogToolName))
              throw new PiFailure(
                'configuration',
                'The tool catalog uses a reserved resolver name.'
              )
            registry.install(
              defineExtension({
                name: 'webmcp-kit',
                tools: roundCatalog.tools.map(function adapt(tool) {
                  return defineTool({
                    name: tool.name,
                    description: tool.description,
                    parameters: Type.Unsafe<Record<string, unknown>>(tool.inputSchema),
                    replay: 'unsafe',
                    async execute(input, _api, execution) {
                      try {
                        if (!accepting)
                          throw new PiFailure('stale_document', 'The turn is no longer active.')
                        if (++toolCalls > limits.maxToolCalls)
                          throw new PiFailure(
                            'limit_reached',
                            'This turn reached its tool limit. Send a new request to continue.'
                          )
                        const currentSignal = AbortSignal.any([
                          signal,
                          ...(execution.abortSignal ? [execution.abortSignal] : [])
                        ])
                        const current = await abortable(
                          options.host.discover(currentSignal),
                          currentSignal
                        )
                        if (current.revision !== roundCatalog.revision)
                          throw new PiFailure(
                            'stale_document',
                            'The tool catalog changed. Send a new request.'
                          )
                        const actionInput = structuredClone(input)
                        const result = await abortable(
                          options.host.invoke(
                            { name: tool.name, input, revision: roundCatalog.revision },
                            currentSignal
                          ),
                          currentSignal
                        )
                        if (
                          !result ||
                          result.toolName !== tool.name ||
                          !['success', 'error', 'blocked', 'unavailable'].includes(result.status)
                        )
                          throw new PiFailure(
                            'tool_failed',
                            'The tool returned an invalid outcome. Check application state before continuing.'
                          )
                        if (jsonBytes(result) > limits.maxRequestBytes)
                          throw new PiFailure(
                            'limit_reached',
                            'The tool result exceeds the request budget. The action may have completed; check application state.'
                          )
                        completedActions.push({
                          toolName: tool.name,
                          input: actionInput,
                          status: result.status
                        })
                        if (result.status !== 'success')
                          failure = {
                            code:
                              result.code === 'confirmation_denied'
                                ? 'action_denied'
                                : 'tool_failed',
                            message: result.error ?? 'The action did not succeed.'
                          }
                        else {
                          // Pi captures its offered tools before the next model request.
                          try {
                            const next = await abortable(
                              options.host.discover(currentSignal),
                              currentSignal
                            )
                            if (next.revision !== catalog.revision) {
                              installCatalog(next)
                              catalog = next
                            }
                          } catch (error) {
                            // Preserve the known action result even when discovering its next context fails.
                            failure = piError(error, 'tool_failed')
                          }
                        }
                        return {
                          output: [{ type: 'text' as const, text: JSON.stringify(result) }],
                          isError: result.status !== 'success',
                          ...(failure ? { control: { terminate: true as const } } : {})
                        }
                      } catch (error) {
                        failure = piError(error, 'tool_failed')
                        return {
                          output: [{ type: 'text' as const, text: failure.message }],
                          isError: true,
                          control: { terminate: true as const }
                        }
                      }
                    }
                  })
                })
              })
            )
          }
          installCatalog(catalog)
          function refreshCatalog(current: PiToolCatalog) {
            if (catalogRefreshed)
              throw new PiFailure('stale_document', 'The tool catalog changed. Send a new request.')
            if (++toolCalls > limits.maxToolCalls)
              throw new PiFailure(
                'limit_reached',
                'This turn reached its tool limit. Send a new request to continue.'
              )
            installCatalog(current)
            catalog = current
            catalogRefreshed = true
            // Pi captured its tools before this request; an internal round refreshes that snapshot.
            return {
              toolName: piRefreshCatalogToolName,
              input: {},
              confidence: 1,
              reason: 'Refresh available tools.'
            }
          }
          const models = createPiModels(async function resolution(messages, requestSignal) {
            if (!accepting)
              throw new PiFailure(
                'stale_document',
                'An interrupted turn cannot request another action.'
              )
            const currentSignal = AbortSignal.any([
              signal,
              ...(requestSignal ? [requestSignal] : [])
            ])
            try {
              const current = await abortable(options.host.discover(currentSignal), currentSignal)
              if (current.revision !== catalog.revision) return refreshCatalog(current)
              catalogRefreshed = false
              const resolution = await resolvePiRound(
                options.resolver,
                messages,
                current.tools,
                {
                  ...(await abortable(options.host.context(currentSignal), currentSignal)),
                  piCompletedActions: structuredClone(completedActions)
                },
                currentSignal,
                limits.maxRequestBytes,
                text
              )
              const latest = await abortable(options.host.discover(currentSignal), currentSignal)
              if (latest.revision !== current.revision) return refreshCatalog(latest)
              return resolution
            } catch (error) {
              failure = piError(error)
              throw error
            }
          })
          const storage = await openPiStorage(key, limits.maxHistoryBytes)
          try {
            harness = await Harness.open(
              storage,
              {
                models,
                registry,
                settings: {
                  toolExecution: 'sequential',
                  retry: { enabled: false },
                  compaction: piCompactionPolicy(limits.maxRequestBytes),
                  stream: { maxRetries: 0 }
                }
              },
              context
            )
          } catch (error) {
            await storage.close(context)
            throw error
          }
          conversation = await harness.root(context, {
            agent: {
              model: piModel,
              thinkingLevel: 'off',
              instructions:
                'Assist using current application tools and context. Re-resolve after each result. Never replay abandoned actions. Application validation and approval are authoritative.'
            }
          })
          const entries = await readPiHistory(conversation, context)
          const history = new Map(
            entries.map(function entry(entry) {
              return [entry.id, entry]
            })
          )
          const previousTurn = lastTurnState({ entries })
          interrupted = previousTurn === 'started' || previousTurn === 'interrupted'
          // Abort before enabling any resolver or page request on recovery.
          await conversation.abort(context)
          // Root creation options do not update a restored conversation's persisted model.
          await conversation.configure({ model: piModel }, context)
          if (previousTurn === 'started')
            await conversation.submit(
              { type: 'write', entry: { kind: 'webmcp.turn.interrupted' } },
              context
            )
          signal.addEventListener('abort', abort, { once: true })
          watch = await conversation.watch(context)
          function remember(view: ConversationView) {
            for (const entry of view.entries) history.set(entry.id, entry)
            return normalizeMessages({
              entries: [...history.values()].sort(function chronological(left, right) {
                return left.id < right.id ? -1 : 1
              })
            })
          }
          function update(view: ConversationView) {
            publish({
              state: signal.aborted
                ? 'stopping'
                : text !== undefined
                  ? 'running'
                  : interrupted
                    ? 'interrupted'
                    : 'idle',
              messages: remember(view)
            })
          }
          update(watch.value)
          watch.start(async function changed(view) {
            update(view)
          })
          if (text !== undefined) {
            signal.throwIfAborted()
            await conversation.submit(
              { type: 'write', entry: { kind: 'webmcp.turn.started' } },
              context
            )
            accepting = true
            const submission = await conversation.submit(
              { type: 'input', content: text, requestId: crypto.randomUUID(), whenBusy: 'reject' },
              context
            )
            const settled = await submission.wait(context)
            accepting = false
            if (!signal.aborted && !failure && settled.status === 'unanswered')
              failure = {
                code: 'provider_failed',
                message: `The conversation could not answer this request (${settled.reason}). Send a new request.`
              }
            await aborting
            await conversation.submit(
              {
                type: 'write',
                entry: { kind: signal.aborted ? 'webmcp.turn.interrupted' : 'webmcp.turn.finished' }
              },
              context
            )
          }
          await watch.stop()
          watch = undefined
          const current = await conversation.watch(context)
          const messages = remember(current.value)
          await current.stop()
          const wasInterrupted = signal.aborted || (text === undefined && interrupted)
          publish({
            state: wasInterrupted ? 'interrupted' : failure ? 'error' : 'idle',
            messages,
            ...(failure && !signal.aborted ? { error: failure } : {})
          })
          return {
            status: wasInterrupted ? 'interrupted' : failure ? 'error' : 'completed',
            ...(failure && !signal.aborted ? { error: failure } : {})
          }
        } finally {
          accepting = false
          signal.removeEventListener('abort', abort)
          try {
            await aborting
            await watch?.stop()
          } finally {
            await harness?.close(context)
          }
        }
      })
    } catch (error) {
      const outcome: PiTurnOutcome = signal.aborted
        ? { status: 'interrupted' }
        : { status: 'error', error: piError(error, 'storage_failed') }
      publish({
        ...snapshot,
        state: signal.aborted ? 'interrupted' : 'error',
        error: outcome.error
      })
      return outcome
    }
  }

  const api: PiController = {
    getSnapshot() {
      return structuredClone(snapshot)
    },
    subscribe(listener) {
      listeners.add(listener)
      listener(structuredClone(snapshot))
      return function unsubscribe() {
        listeners.delete(listener)
      }
    },
    async send(text) {
      if (closed || active || clearing)
        return {
          status: 'error',
          error: {
            code: 'conversation_busy',
            message: closed
              ? 'This conversation has closed.'
              : 'Wait for the current operation to finish.'
          }
        }
      if (typeof text !== 'string' || !text.trim() || text.length > 16000)
        return {
          status: 'error',
          error: { code: 'configuration', message: 'Enter a message of 1–16000 characters.' }
        }
      controller = new AbortController()
      active = run(text.trim(), controller.signal)
      publish({ ...snapshot, state: 'running', error: undefined })
      try {
        return await active
      } finally {
        active = undefined
        controller = undefined
      }
    },
    async stop() {
      if (!active) return
      publish({ ...snapshot, state: 'stopping' })
      controller?.abort()
      await active
    },
    async clear() {
      if (closed || active || clearing)
        throw new PiFailure('conversation_busy', 'Stop the current turn before clearing chat.')
      clearing = true
      clearOperation = withLock(function clear() {
        return clearPiStorage(key)
      })
      try {
        await clearOperation
        publish({ state: 'idle', messages: [] })
      } catch (error) {
        publish({ ...snapshot, state: 'error', error: piError(error, 'storage_failed') })
        throw error
      } finally {
        clearing = false
        clearOperation = undefined
      }
    },
    async destroy() {
      if (closed) return
      closed = true
      await api.stop()
      await clearOperation?.catch(function settled() {})
      publish({ ...snapshot, state: 'closed' })
      listeners.clear()
    }
  }
  await run()
  return api
}
