import { createStateMachine } from '../../core/src/state-machine'
import { createDeferred } from '../../core/src/deferred'
import type { TurnState, TurnEvent, CorrectionState, CatalogState } from './interfaces/turn-state'
import { transitionTurn, transitionCorrection, transitionCatalog } from './turn-state'
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
import { transitionAction, withActionRisk } from './action-state'
import type { PiActionState, PiActionEvent, PiActionOutcome } from './interfaces/action-outcome'
import { piSessionKey, resolvePiLimits } from './session'
import { clearPiStorage, openPiStorage, piStorageExists, type PiBrowserStorage } from './storage'
import type { RuntimeState, RuntimeEvent } from './interfaces/runtime-state'
import { transitionRuntime } from './runtime-state'
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
  const lifecycle = createStateMachine<RuntimeState, RuntimeEvent>(
    { kind: 'opening', pending: 'none' },
    transitionRuntime
  )
  const notification = createStateMachine<'idle' | 'queued', 'queue' | 'flush'>(
    'idle',
    function transitionNotification(state, event) {
      return event === 'queue' && state === 'idle'
        ? 'queued'
        : event === 'flush' && state === 'queued'
          ? 'idle'
          : state
    }
  )
  // Other tabs and controllers reload when this conversation changes.
  const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(key)
  ;(channel as { unref?: () => void } | undefined)?.unref?.()
  channel?.addEventListener('message', function changedElsewhere(event: MessageEvent) {
    lifecycle.send(
      { type: event.data === 'cleared' ? 'cleared' : 'changed' },
      function changed({ state, event }) {
        if (state.kind !== 'ready') return
        if (event.type === 'cleared') publishEmpty()
        else void reload(true)
      }
    )
  })
  function publishEmpty() {
    publish({
      state: 'idle',
      messages: [],
      usage: { historyBytes: 0, maxHistoryBytes: limits.maxHistoryBytes }
    })
  }
  function announce(change: 'changed' | 'cleared') {
    if (lifecycle.state.kind !== 'closing' && lifecycle.state.kind !== 'closed')
      channel?.postMessage(change)
  }

  function reload(waitForLock: boolean): Promise<PiTurnOutcome> {
    return startTurn('refreshing', undefined, waitForLock)
  }

  function startTurn(kind: 'running' | 'refreshing', text?: string, waitForLock = false) {
    const controller = new AbortController()
    const task = createDeferred<PiTurnOutcome>()
    const promise = task.promise.finally(function settle() {
      lifecycle.send({ type: 'settle', promise }, function settled() {
        if (kind === 'running') announce('changed')
      })
    })
    if (
      !lifecycle.send(
        { type: 'start', operation: { kind, controller, promise } },
        function begin() {
          if (kind === 'running') publish({ ...snapshot, state: 'running', error: undefined })
          task.resolve(
            Promise.resolve().then(function runTurn() {
              return run(
                text,
                controller.signal,
                kind === 'refreshing' ? { waitForLock } : undefined
              )
            })
          )
        }
      )
    )
      task.resolve({
        status: 'error',
        error: piError(
          new PiFailure('conversation_busy', 'Wait for the current operation to finish.')
        )
      })
    return promise
  }

  // One frozen copy per change is shared by every reader; updates within a task notify once.
  function publish(next: PiSnapshot) {
    snapshot = freeze(structuredClone(next))
    notification.send('queue', function queue() {
      queueMicrotask(function notify() {
        notification.send('flush', function deliver() {
          const current = snapshot
          for (const listener of listeners) {
            try {
              listener(current)
            } catch {
              /* Subscribers cannot interrupt persistence. */
            }
          }
          if (current.state === 'closed') listeners.clear()
        })
      })
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
    const turn = createStateMachine<TurnState, TurnEvent>('recovering', transitionTurn)
    let failure: PiError | undefined
    let recoveredTurn: ReturnType<typeof lastTurnState>
    let aborting: Promise<void> | undefined
    let toolCalls = 0
    const completedActions: PiActionOutcome[] = []
    const unchangedReads = new Map<string, { result: string; count: number }>()
    const progressCorrection = createStateMachine<CorrectionState, 'correct'>(
      'available',
      transitionCorrection
    )
    const catalogState = createStateMachine<CatalogState, 'refresh' | 'resolve'>(
      'current',
      transitionCatalog
    )
    const validationCorrection = createStateMachine<CorrectionState, 'correct'>(
      'available',
      transitionCorrection
    )
    let activity: PiActivity | undefined
    let storage: PiBrowserStorage | undefined
    // An action reached the page but its result is not recorded yet.
    const action = createStateMachine<PiActionState, PiActionEvent>(
      { kind: 'not-started' },
      transitionAction
    )
    function usage() {
      return storage
        ? { historyBytes: storage.usedBytes, maxHistoryBytes: limits.maxHistoryBytes }
        : snapshot.usage
    }
    function setActivity(next: PiActivity) {
      activity = next
      if (text !== undefined && !signal.aborted) publish({ ...snapshot, activity })
    }
    function abort() {
      turn.send('stop', function stop() {
        aborting ??= conversation?.abort(context)
      })
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
                      if (turn.state !== 'accepting')
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
                        if (turn.state !== 'accepting')
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
                        const invocation = action.act(
                          { type: 'invoke', callId: api.callId },
                          function invoke() {
                            return options.host.invoke(
                              { name: tool.name, input, revision: roundCatalog.revision },
                              currentSignal,
                              function progress(phase) {
                                setActivity({ kind: 'tool', toolName: tool.name, phase })
                              }
                            )
                          }
                        )
                        if (!invocation.accepted)
                          throw new PiFailure(
                            'stale_document',
                            'Another action is still awaiting its result.'
                          )
                        const result = await abortable(invocation.value, currentSignal)
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
                        action.send({ type: 'receive', callId: api.callId })
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
            const refreshed = catalogState.act('refresh', function refresh() {
              if (++toolCalls > limits.maxToolCalls)
                throw new PiFailure(
                  'limit_reached',
                  'This turn reached its tool limit. Send a new request to continue.',
                  { reason: 'tool_calls' }
                )
              installCatalog(current)
              catalog = current
              return {
                toolName: piRefreshCatalogToolName,
                input: {},
                confidence: 1,
                reason: 'Refresh available tools.'
              }
            })
            if (!refreshed.accepted)
              throw new PiFailure('stale_document', 'The tool catalog changed. Send a new request.')
            return refreshed.value
          }
          const models = createPiModels(async function resolution(
            messages,
            requestSignal
          ): Promise<PiRoundResult> {
            if (turn.state !== 'accepting')
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
              catalogState.send('resolve')
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
                // Small models get one bounded correction for invalid output per turn.
                if (!(error instanceof ToolResolutionValidationError)) throw error
                const correction = validationCorrection.act('correct', function correct() {
                  if (++toolCalls > limits.maxToolCalls)
                    throw new PiFailure(
                      'limit_reached',
                      'This turn reached its tool limit. Send a new request to continue.',
                      { reason: 'tool_calls' }
                    )
                  return round(getErrorMessage(error))
                })
                if (!correction.accepted) throw error
                result = await correction.value
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
                const correction = progressCorrection.act('correct', function correct() {
                  return round(message)
                })
                if (correction.accepted) result = await correction.value
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
          recoveredTurn = previousTurn
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
            for (const entry of view.entries) {
              history.set(entry.id, entry)
              for (const message of entry.model ?? [])
                if (message.role === 'toolResult')
                  action.send({ type: 'persist', callId: message.toolCallId })
            }
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
                  : recoveredTurn === 'started' || recoveredTurn === 'interrupted'
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
            const submission = turn.act('start', function submit() {
              return conversation!.submit(
                {
                  type: 'input',
                  content: text,
                  requestId: crypto.randomUUID(),
                  whenBusy: 'reject'
                },
                context
              )
            })
            if (!submission.accepted) {
              signal.throwIfAborted()
              throw new PiFailure('stale_document', 'The turn is no longer active.')
            }
            const settled = await (await submission.value).wait(context)
            turn.send('settle')
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
          const wasInterrupted =
            signal.aborted ||
            (text === undefined && (recoveredTurn === 'started' || recoveredTurn === 'interrupted'))
          const finalError =
            failure && !signal.aborted ? withActionRisk(action.state, failure) : undefined
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
          turn.send('settle')
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
        : { status: 'error', error: withActionRisk(action.state, piError(error, 'storage_failed')) }
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
      if (lifecycle.state.kind !== 'closed') listeners.add(listener)
      listener(snapshot)
      return function unsubscribe() {
        listeners.delete(listener)
      }
    },
    async send(text) {
      if (lifecycle.state.kind === 'refreshing' || lifecycle.state.kind === 'refresh-stopping')
        await lifecycle.state.promise
      if (lifecycle.state.kind !== 'ready')
        return {
          status: 'error',
          error: {
            code: 'conversation_busy',
            message:
              lifecycle.state.kind === 'closing' || lifecycle.state.kind === 'closed'
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
      return startTurn('running', text.trim())
    },
    async stop() {
      if (lifecycle.state.kind === 'closing') return lifecycle.state.promise
      if (
        lifecycle.state.kind !== 'running' &&
        lifecycle.state.kind !== 'refreshing' &&
        lifecycle.state.kind !== 'stopping' &&
        lifecycle.state.kind !== 'refresh-stopping'
      )
        return
      const operation = lifecycle.state
      if (
        !lifecycle.send({ type: 'stop' }, function stop() {
          if ('controller' in operation) {
            publish({ ...snapshot, state: 'stopping' })
            operation.controller.abort()
          }
        })
      ) {
        if ('promise' in operation) await operation.promise
        return
      }
      if ('promise' in operation) await operation.promise
    },
    async clear() {
      if (lifecycle.state.kind === 'refreshing' || lifecycle.state.kind === 'refresh-stopping')
        await lifecycle.state.promise
      if (lifecycle.state.kind !== 'ready')
        throw new PiFailure('conversation_busy', 'Stop the current turn before clearing chat.')
      const task = createDeferred<void>()
      const promise = task.promise.finally(function settle() {
        lifecycle.send({ type: 'settle', promise })
      })
      if (
        !lifecycle.send(
          { type: 'start', operation: { kind: 'clearing', promise } },
          function clear() {
            task.resolve(
              withLock(undefined, function removeStorage() {
                return clearPiStorage(key)
              })
                .then(function cleared() {
                  publishEmpty()
                  announce('cleared')
                })
                .catch(function failed(error) {
                  publish({ ...snapshot, state: 'error', error: piError(error, 'storage_failed') })
                  throw error
                })
            )
          }
        )
      )
        task.reject(
          new PiFailure('conversation_busy', 'Stop the current turn before clearing chat.')
        )
      await promise
    },
    async refresh() {
      if (lifecycle.state.kind === 'closed' || lifecycle.state.kind === 'closing')
        throw new PiFailure('conversation_busy', 'This conversation has closed.')
      if (lifecycle.state.kind === 'refreshing' || lifecycle.state.kind === 'refresh-stopping')
        return lifecycle.state.promise.then(function refreshed() {})
      if (lifecycle.state.kind !== 'ready')
        throw new PiFailure('conversation_busy', 'Wait for the current operation to finish.')
      await reload(false)
    },
    destroy() {
      if (lifecycle.state.kind === 'closed') return Promise.resolve()
      if (lifecycle.state.kind === 'closing') return lifecycle.state.promise
      const task = createDeferred<void>()
      lifecycle.send({ type: 'close', promise: task.promise }, function close({ previous }) {
        if ('controller' in previous) {
          publish({ ...snapshot, state: 'stopping' })
          previous.controller.abort()
        }
        task.resolve(
          Promise.resolve().then(async function finish() {
            if ('promise' in previous) await previous.promise.catch(function settled() {})
            lifecycle.send({ type: 'closed' }, function closed() {
              channel?.close()
              publish({ ...snapshot, state: 'closed' })
            })
          })
        )
      })
      return task.promise
    }
  }
  await run()
  lifecycle.send({ type: 'opened' }, function opened({ previous }) {
    if (previous.kind !== 'opening') return
    if (previous.pending === 'cleared') publishEmpty()
    else if (previous.pending === 'changed') void reload(true)
  })
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
