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
import {
  getErrorMessage,
  ToolResolutionValidationError,
  type ResolverModelLimits
} from '@vampaz/webmcp-kit'
import type {
  PiActivity,
  PiController,
  PiError,
  PiRuntimeOptions,
  PiSnapshot,
  PiTurnOutcome
} from './interfaces/controller'
import { abortable, jsonBytes, piError, PiFailure } from './errors'
import { createPiModels, piModel, type PiRoundResult } from './model-adapter'
import { piRefreshCatalogToolName, resolvePiRound } from './resolver-adapter'
import { normalizeMessages, lastTurnState, piActionInvokingKind, readPiHistory } from './recovery'
import type { PiToolCatalog } from './interfaces/host'
import type { PiActionOutcome } from './interfaces/action-outcome'
import { piSessionKey, resolvePiLimits } from './session'
import { clearPiStorage, openPiStorage, piStorageExists, type PiBrowserStorage } from './storage'
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
  let snapshot: PiSnapshot = freeze({ state: 'loading', messages: [] })
  const listeners = new Set<(snapshot: PiSnapshot) => void>()
  let controller: AbortController | undefined
  let active: Promise<PiTurnOutcome> | undefined
  let closed = false
  let clearing = false
  let clearOperation: Promise<void> | undefined
  // A history reload, often started by another tab; user operations wait for it instead of failing.
  let refreshing: Promise<void> | undefined
  let notifying = false
  // Other tabs and controllers reload when this conversation changes.
  const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(key)
  ;(channel as { unref?: () => void } | undefined)?.unref?.()
  channel?.addEventListener('message', function changedElsewhere(event: MessageEvent) {
    if (closed) return
    if (event.data === 'cleared') {
      // The database was deleted; reopening it would recreate an empty conversation.
      if (!active && !clearing)
        publish({
          state: 'idle',
          messages: [],
          usage: { historyBytes: 0, maxHistoryBytes: limits.maxHistoryBytes }
        })
      return
    }
    // Queue idle readers; a slow reload in another tab must not exhaust a retry window.
    if (!active && !clearing) void reload(true)
  })
  function announce(change: 'changed' | 'cleared') {
    if (!closed) channel?.postMessage(change)
  }

  function reload(waitForLock: boolean): Promise<PiTurnOutcome> {
    controller = new AbortController()
    const operation = run(undefined, controller.signal, { waitForLock })
    active = operation
    refreshing = operation.then(function reloaded() {})
    return operation.finally(function settle() {
      if (active === operation) {
        active = undefined
        controller = undefined
      }
      refreshing = undefined
    })
  }

  // One frozen copy per change is shared by every reader; updates within a task notify once.
  function publish(next: PiSnapshot) {
    snapshot = freeze(structuredClone(next))
    if (notifying) return
    notifying = true
    queueMicrotask(function notify() {
      notifying = false
      const current = snapshot
      for (const listener of listeners) {
        try {
          listener(current)
        } catch {
          /* A subscriber cannot interrupt persistence. */
        }
      }
    })
  }

  // The page answers discovery and context promptly; approval waits are not bounded by this.
  function hostCall<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
    const timeout = AbortSignal.timeout(limits.requestTimeoutMs)
    return abortable(pending, AbortSignal.any([signal, timeout])).catch(function timedOut(error) {
      if (timeout.aborted && !signal.aborted)
        throw new PiFailure(
          'stale_document',
          'The page did not answer in time. Check application state, then send a new request.',
          { reason: 'timeout' }
        )
      throw error
    })
  }

  async function withLock<T>(
    waitSignal: AbortSignal | undefined,
    operation: () => Promise<T>
  ): Promise<T> {
    return navigator.locks.request(
      key,
      waitSignal ? { signal: waitSignal } : { ifAvailable: true },
      async function locked(lock) {
        if (!lock)
          throw new PiFailure(
            'conversation_busy',
            'This conversation is open in an active operation. Wait for the other chat to finish.'
          )
        return operation()
      }
    )
  }

  async function run(
    text?: string,
    signal = new AbortController().signal,
    reloading: { waitForLock: boolean } | undefined = undefined
  ): Promise<PiTurnOutcome> {
    let harness: Harness | undefined
    let conversation: Conversation | undefined
    let watch: ConversationWatch | undefined
    let accepting = false
    let failure: PiError | undefined
    let interrupted = false
    let aborting: Promise<void> | undefined
    let toolCalls = 0
    const completedActions: PiActionOutcome[] = []
    const unchangedReads = new Map<string, { result: string; count: number }>()
    let progressCorrected = false
    let catalogRefreshed = false
    let corrected = false
    let activity: PiActivity | undefined
    let storage: PiBrowserStorage | undefined
    // An action reached the page but its result is not recorded yet.
    let actionInFlight = false
    let actionInvoked = false
    function usage() {
      return storage
        ? { historyBytes: storage.usedBytes, maxHistoryBytes: limits.maxHistoryBytes }
        : snapshot.usage
    }
    function setActivity(next: PiActivity) {
      activity = next
      if (text !== undefined && !signal.aborted) publish({ ...snapshot, activity })
    }
    // A lost save after an invoked action leaves its outcome unrecorded, so the user must check.
    function withActionRisk(error: PiError): PiError {
      const unsaved = error.code === 'storage_failed' || error.reason === 'history_bytes'
      return actionInFlight || (unsaved && actionInvoked)
        ? { ...error, actionMayHaveRun: true }
        : error
    }
    function abort() {
      accepting = false
      aborting ??= conversation?.abort(context)
    }
    const waitSignal = reloading?.waitForLock ? signal : undefined
    try {
      return await withLock(waitSignal, async function operate() {
        try {
          signal.throwIfAborted()
          const modelSignal = AbortSignal.any([
            signal,
            AbortSignal.timeout(limits.requestTimeoutMs)
          ])
          let model: ResolverModelLimits | undefined
          try {
            if (text !== undefined && options.resolver.getModelLimits)
              model = await abortable(options.resolver.getModelLimits(modelSignal), modelSignal)
          } catch (error) {
            signal.throwIfAborted()
            throw new PiFailure(
              'provider_failed',
              modelSignal.aborted
                ? 'Loading model information timed out. Try again.'
                : `Could not read the selected model's limits: ${getErrorMessage(error)}`
            )
          }
          const turnLimits = resolvePiLimits(options.limits, model)
          // A reload must not create a database: a missing one was cleared by another controller,
          // and recreating it would leave an empty conversation behind. Opening still creates it,
          // so unavailable storage is reported as soon as a controller opens.
          if (reloading && (await piStorageExists(key)) === false) {
            publish({
              state: 'idle',
              messages: [],
              usage: { historyBytes: 0, maxHistoryBytes: limits.maxHistoryBytes }
            })
            return { status: 'completed' }
          }
          let catalog = await hostCall(options.host.discover(signal), signal)
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
                      setActivity({ kind: 'compacting' })
                      const summary = await summarizePiHistory(
                        options.resolver,
                        compaction.entries[0]?.kind === 'pi.compaction'
                          ? compaction.messages.slice(1)
                          : compaction.messages,
                        text ?? '',
                        currentSignal,
                        turnLimits.maxRequestBytes,
                        compaction.entries[0]?.kind === 'pi.compaction'
                          ? compaction.messages[0]
                          : undefined,
                        {
                          contextTokens: turnLimits.contextTokens,
                          timeoutMs: turnLimits.requestTimeoutMs
                        }
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
                    async execute(input, api, execution) {
                      try {
                        if (!accepting)
                          throw new PiFailure('stale_document', 'The turn is no longer active.')
                        if (++toolCalls > limits.maxToolCalls)
                          throw new PiFailure(
                            'limit_reached',
                            'This turn reached its tool limit. Send a new request to continue.',
                            { reason: 'tool_calls' }
                          )
                        setActivity({ kind: 'tool', toolName: tool.name, phase: 'running' })
                        const currentSignal = AbortSignal.any([
                          signal,
                          ...(execution.abortSignal ? [execution.abortSignal] : [])
                        ])
                        const current = await hostCall(
                          options.host.discover(currentSignal),
                          currentSignal
                        )
                        if (current.revision !== roundCatalog.revision)
                          throw new PiFailure(
                            'stale_document',
                            'The tool catalog changed. Send a new request.'
                          )
                        const actionInput = structuredClone(input)
                        // Recorded before the page sees the call, so recovery can say the outcome is unknown.
                        await api.commit(function markInvoking(tx) {
                          return tx.appendEntry(api.conversationId, {
                            kind: piActionInvokingKind,
                            data: { callId: api.callId, toolName: tool.name }
                          })
                        }, execution)
                        actionInFlight = true
                        actionInvoked = true
                        const result = await abortable(
                          options.host.invoke(
                            { name: tool.name, input, revision: roundCatalog.revision },
                            currentSignal,
                            function progress(phase) {
                              setActivity({ kind: 'tool', toolName: tool.name, phase })
                            }
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
                        // The next request must still fit the result beside history, tools and context.
                        if (jsonBytes(result) > turnLimits.maxRequestBytes / 2)
                          throw new PiFailure(
                            'limit_reached',
                            'The tool result is too large for the next model request. The action may have completed; check application state.',
                            { reason: 'tool_result_bytes', actionMayHaveRun: true }
                          )
                        completedActions.push({
                          toolName: tool.name,
                          input: actionInput,
                          status: result.status
                        })
                        if (
                          tool.annotations?.readOnlyHint === true &&
                          result.status === 'success'
                        ) {
                          const key = canonicalJson([roundCatalog.revision, tool.name, actionInput])
                          const output = result.output as { status?: unknown } | undefined
                          if (output?.status === 'pending') unchangedReads.delete(key)
                          else {
                            const value = canonicalJson([roundCatalog.revision, result.output])
                            const previous = unchangedReads.get(key)
                            unchangedReads.set(key, {
                              result: value,
                              count: previous?.result === value ? previous.count + 1 : 1
                            })
                          }
                        } else unchangedReads.clear()
                        actionInFlight = false
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
                            const next = await hostCall(
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
                        // Bookkeeping such as invocation IDs and timing stays out of the durable log.
                        const outcome = {
                          status: result.status,
                          ...(result.code ? { code: result.code } : {}),
                          ...(result.error ? { error: result.error } : {}),
                          ...(result.details ? { details: result.details } : {}),
                          ...(result.output !== undefined ? { output: result.output } : {})
                        }
                        return {
                          output: [{ type: 'text' as const, text: JSON.stringify(outcome) }],
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
                'This turn reached its tool limit. Send a new request to continue.',
                { reason: 'tool_calls' }
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
          const models = createPiModels(async function resolution(
            messages,
            requestSignal
          ): Promise<PiRoundResult> {
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
              setActivity({ kind: 'resolving' })
              const current = await hostCall(options.host.discover(currentSignal), currentSignal)
              if (current.revision !== catalog.revision)
                return { resolution: refreshCatalog(current) }
              catalogRefreshed = false
              const roundContext = {
                ...(await hostCall(options.host.context(currentSignal), currentSignal)),
                piCompletedActions: structuredClone(completedActions)
              }
              function round(correction?: string) {
                return resolvePiRound(
                  options.resolver,
                  messages,
                  current.tools,
                  roundContext,
                  currentSignal,
                  turnLimits.maxRequestBytes,
                  turnLimits.requestTimeoutMs,
                  text,
                  correction
                )
              }
              let result: PiRoundResult
              try {
                result = await round()
              } catch (error) {
                // Small models sometimes return one invalid action; allow one bounded correction per turn.
                if (!(error instanceof ToolResolutionValidationError) || corrected) throw error
                corrected = true
                if (++toolCalls > limits.maxToolCalls)
                  throw new PiFailure(
                    'limit_reached',
                    'This turn reached its tool limit. Send a new request to continue.',
                    { reason: 'tool_calls' }
                  )
                result = await round(getErrorMessage(error))
              }
              function repeatsUnchangedRead(candidate: PiRoundResult) {
                const { toolName, input } = candidate.resolution
                return (
                  (unchangedReads.get(canonicalJson([current.revision, toolName, input]))?.count ??
                    0) >= 2
                )
              }
              if (repeatsUnchangedRead(result)) {
                const message =
                  'The same read returned unchanged results twice. Use pi_reply if the request is satisfied, or choose a different action that makes progress.'
                if (!progressCorrected) {
                  progressCorrected = true
                  result = await round(message)
                }
                if (repeatsUnchangedRead(result))
                  throw new PiFailure(
                    'limit_reached',
                    'This turn stopped because repeated reads made no progress. Check the results before continuing.',
                    { reason: 'no_progress' }
                  )
              }
              const latest = await hostCall(options.host.discover(currentSignal), currentSignal)
              if (latest.revision !== current.revision)
                return { resolution: refreshCatalog(latest) }
              return result
            } catch (error) {
              failure = piError(error)
              throw error
            }
          }, turnLimits.contextTokens)
          storage = await openPiStorage(key, limits.maxHistoryBytes)
          try {
            harness = await Harness.open(
              storage,
              {
                models,
                registry,
                settings: {
                  toolExecution: 'sequential',
                  retry: { enabled: false },
                  compaction: piCompactionPolicy(
                    turnLimits.maxRequestBytes,
                    turnLimits.contextTokens,
                    model
                  ),
                  stream: { maxRetries: 0 }
                }
              },
              context
            )
          } catch (error) {
            await storage.close(context)
            throw error
          }
          const openedStorage = storage
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
            const running = text !== undefined && !signal.aborted
            publish({
              state: signal.aborted
                ? 'stopping'
                : text !== undefined
                  ? 'running'
                  : interrupted
                    ? 'interrupted'
                    : 'idle',
              messages: remember(view),
              usage: {
                historyBytes: openedStorage.usedBytes,
                maxHistoryBytes: limits.maxHistoryBytes
              },
              ...(running && activity ? { activity } : {})
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
          const finalError = failure && !signal.aborted ? withActionRisk(failure) : undefined
          publish({
            state: wasInterrupted ? 'interrupted' : failure ? 'error' : 'idle',
            messages,
            usage: usage(),
            ...(finalError ? { error: finalError } : {})
          })
          return {
            status: wasInterrupted ? 'interrupted' : failure ? 'error' : 'completed',
            ...(finalError ? { error: finalError } : {})
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
        : { status: 'error', error: withActionRisk(piError(error, 'storage_failed')) }
      const { activity: _activity, ...rest } = snapshot
      publish({
        ...rest,
        state: signal.aborted ? 'interrupted' : 'error',
        error: outcome.error
      })
      return outcome
    }
  }

  const api: PiController = {
    getSnapshot() {
      return snapshot
    },
    subscribe(listener) {
      listeners.add(listener)
      listener(snapshot)
      return function unsubscribe() {
        listeners.delete(listener)
      }
    },
    async send(text) {
      if (refreshing) await refreshing.catch(function settled() {})
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
      if (typeof text !== 'string' || !text.trim() || text.length > limits.maxMessageChars)
        return {
          status: 'error',
          error: {
            code: 'configuration',
            message: `Enter a message of 1–${limits.maxMessageChars} characters.`
          }
        }
      controller = new AbortController()
      active = run(text.trim(), controller.signal)
      publish({ ...snapshot, state: 'running', error: undefined })
      try {
        return await active
      } finally {
        active = undefined
        controller = undefined
        announce('changed')
      }
    },
    async stop() {
      if (!active) return
      publish({ ...snapshot, state: 'stopping' })
      controller?.abort()
      await active
    },
    async clear() {
      if (refreshing) await refreshing.catch(function settled() {})
      if (closed || active || clearing)
        throw new PiFailure('conversation_busy', 'Stop the current turn before clearing chat.')
      clearing = true
      clearOperation = withLock(undefined, function clear() {
        return clearPiStorage(key)
      })
      try {
        await clearOperation
        publish({
          state: 'idle',
          messages: [],
          usage: { historyBytes: 0, maxHistoryBytes: limits.maxHistoryBytes }
        })
        announce('cleared')
      } catch (error) {
        publish({ ...snapshot, state: 'error', error: piError(error, 'storage_failed') })
        throw error
      } finally {
        clearing = false
        clearOperation = undefined
      }
    },
    async refresh() {
      if (closed) throw new PiFailure('conversation_busy', 'This conversation has closed.')
      if (refreshing) return refreshing
      if (active || clearing)
        throw new PiFailure('conversation_busy', 'Wait for the current operation to finish.')
      await reload(false)
    },
    async destroy() {
      if (closed) return
      closed = true
      await api.stop()
      await clearOperation?.catch(function settled() {})
      channel?.close()
      publish({ ...snapshot, state: 'closed' })
      listeners.clear()
    }
  }
  await run()
  return api
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) freeze(child)
  }
  return value
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, function ordered(_key, item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item
    return Object.fromEntries(
      Object.entries(item).sort(([left], [right]) => left.localeCompare(right))
    )
  })
}
