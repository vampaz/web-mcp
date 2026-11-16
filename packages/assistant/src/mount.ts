import { createPiHarness, type PiController } from '@vampaz/webmcp-kit/pi'
import { defineWebMCPChat, type WebMCPChatElement } from '@vampaz/webmcp-kit/chat'
import { createDeferred } from '../../core/src/deferred'
import { createStateMachine } from '../../core/src/state-machine'
import type { MountAssistantOptions, MountedAssistant } from './interfaces/assistant'

type AssistantState =
  | { kind: 'initializing' }
  | { kind: 'mounted'; controller: PiController; element: WebMCPChatElement }
  | { kind: 'closing-initializing'; teardown: Promise<void> }
  | { kind: 'closing-late'; controller: PiController; teardown: Promise<void> }
  | {
      kind: 'closing-mounted'
      controller: PiController
      element: WebMCPChatElement
      teardown: Promise<void>
    }
  | { kind: 'failed' }
  | { kind: 'destroyed'; teardown: Promise<void> }

type AssistantEvent =
  | { type: 'mount'; controller: PiController; element: WebMCPChatElement }
  | { type: 'late'; controller: PiController }
  | { type: 'fail' }
  | { type: 'destroy'; teardown: Promise<void> }
  | { type: 'destroyed' }

function transitionAssistant(state: AssistantState, event: AssistantEvent): AssistantState {
  switch (event.type) {
    case 'mount':
      return state.kind === 'initializing'
        ? { kind: 'mounted', controller: event.controller, element: event.element }
        : state
    case 'late':
      return state.kind === 'closing-initializing'
        ? { kind: 'closing-late', controller: event.controller, teardown: state.teardown }
        : state
    case 'fail':
      if (state.kind === 'initializing') return { kind: 'failed' }
      return state.kind === 'closing-initializing'
        ? { kind: 'destroyed', teardown: state.teardown }
        : state
    case 'destroy':
      if (state.kind === 'initializing')
        return { kind: 'closing-initializing', teardown: event.teardown }
      if (state.kind === 'mounted')
        return {
          kind: 'closing-mounted',
          controller: state.controller,
          element: state.element,
          teardown: event.teardown
        }
      return state.kind === 'failed' ? { kind: 'destroyed', teardown: event.teardown } : state
    case 'destroyed':
      return state.kind === 'closing-late' || state.kind === 'closing-mounted'
        ? { kind: 'destroyed', teardown: state.teardown }
        : state
  }
}

/**
 * Creates the Pi harness and chat element for an application that owns its tools and resolver.
 * The returned controller and element are undefined until `ready` resolves.
 */
export function mountAssistant(options: MountAssistantOptions): MountedAssistant {
  let resolveReady!: () => void
  let rejectReady!: (error: unknown) => void
  const ready = new Promise<void>(function wait(resolve, reject) {
    resolveReady = resolve
    rejectReady = reject
  })
  let teardown: ReturnType<typeof createDeferred<void>> | undefined
  const lifecycle = createStateMachine<AssistantState, AssistantEvent>(
    { kind: 'initializing' },
    transitionAssistant
  )

  void initialize()

  async function initialize() {
    let next: PiController
    try {
      next = await createPiHarness({
        session: options.session,
        resolver: options.resolver,
        ...(options.context ? { context: options.context } : {}),
        ...(options.limits ? { limits: options.limits } : {}),
        ...(options.onCancel ? { onCancel: options.onCancel } : {})
      })
    } catch (error) {
      settleFailure(error)
      return
    }

    if (lifecycle.state.kind === 'closing-initializing') {
      await finishLateMount(next)
      return
    }

    let chat: WebMCPChatElement | undefined
    try {
      defineWebMCPChat()
      chat = document.createElement('webmcp-chat') as WebMCPChatElement
      const chatOptions = options.chat ?? {}
      chat.configure({
        ...chatOptions,
        mode: chatOptions.mode ?? 'popup',
        controller: next
      })
    } catch (error) {
      await settleMountFailure(error, chat, next)
      return
    }

    if (lifecycle.state.kind !== 'initializing') {
      chat.remove()
      await finishLateMount(next)
      return
    }

    try {
      options.container.append(chat)
    } catch (error) {
      await settleMountFailure(error, chat, next)
      return
    }

    if (lifecycle.state.kind !== 'initializing') {
      chat.remove()
      await finishLateMount(next)
      return
    }

    lifecycle.send({ type: 'mount', controller: next, element: chat })
    resolveReady()
  }

  function settleFailure(error: unknown, cleanup?: { error: unknown }) {
    if (lifecycle.state.kind === 'closing-initializing') {
      lifecycle.send({ type: 'fail' })
      if (cleanup) failTeardown(cleanup.error)
      else completeTeardown()
    } else {
      lifecycle.send({ type: 'fail' })
    }
    rejectReady(error)
  }

  async function settleMountFailure(
    error: unknown,
    chat: WebMCPChatElement | undefined,
    controller: PiController
  ) {
    let cleanup: { error: unknown } | undefined
    try {
      chat?.remove()
    } catch (cause) {
      cleanup = { error: cause }
    }
    try {
      await controller.destroy()
    } catch (cause) {
      cleanup ??= { error: cause }
    }
    settleFailure(error, cleanup)
  }

  async function finishLateMount(controller: PiController) {
    const closing = lifecycle.act({ type: 'late', controller }, function ({ state }) {
      return state
    })
    if (closing.accepted && closing.value.kind === 'closing-late') await finishLate(closing.value)
  }

  async function finishLate(state: Extract<AssistantState, { kind: 'closing-late' }>) {
    try {
      await state.controller.destroy()
    } catch (error) {
      lifecycle.send({ type: 'destroyed' })
      failTeardown(error)
      return
    } finally {
      resolveReady()
    }
    lifecycle.send({ type: 'destroyed' })
    completeTeardown()
  }

  async function finishMounted(state: Extract<AssistantState, { kind: 'closing-mounted' }>) {
    try {
      state.element.remove()
      await state.controller.destroy()
    } catch (error) {
      lifecycle.send({ type: 'destroyed' })
      failTeardown(error)
      return
    }
    lifecycle.send({ type: 'destroyed' })
    completeTeardown()
  }

  function completeTeardown() {
    teardown?.resolve()
  }

  function failTeardown(error: unknown) {
    teardown?.reject(error)
  }

  function destroy(): Promise<void> {
    // Callers that only await destroy must not see an unhandled ready rejection.
    void ready.catch(function handled() {})
    const state = lifecycle.state
    if (state.kind === 'destroyed') return state.teardown
    if (
      state.kind === 'closing-initializing' ||
      state.kind === 'closing-late' ||
      state.kind === 'closing-mounted'
    )
      return state.teardown

    const task = createDeferred<void>()
    teardown = task
    lifecycle.send({ type: 'destroy', teardown: task.promise }, function ({ state: next }) {
      if (next.kind === 'closing-mounted') {
        void finishMounted(next)
      } else if (next.kind === 'destroyed') {
        task.resolve()
      }
    })
    return task.promise
  }

  return {
    ready,
    destroy,
    get element() {
      const state = lifecycle.state
      return state.kind === 'mounted' ? state.element : undefined
    },
    get controller() {
      const state = lifecycle.state
      return state.kind === 'mounted' ? state.controller : undefined
    }
  }
}
