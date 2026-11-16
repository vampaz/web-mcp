import { createStateMachine } from '../../core/src/state-machine'
import type { WebMCPChatApprovalRequest, WebMCPChatLabels } from './interfaces/chat'

type ApprovalState = 'idle' | 'pending'
type ApprovalEvent = 'request' | 'settle'

function transitionApproval(state: ApprovalState, event: ApprovalEvent): ApprovalState {
  if (event === 'request') return 'pending'
  return 'idle'
}

export interface ChatApprovalOptions {
  getLabels: () => WebMCPChatLabels
  getToolLabel?: () => ((toolName: string) => string) | undefined
  onOpen?: () => void
  onResolve?: (approved: boolean, fromUser: boolean) => void
}

/** One in-transcript approval card at a time. The application owns when to request it. */
export class ChatApproval {
  private readonly machine = createStateMachine<ApprovalState, ApprovalEvent>(
    'idle',
    transitionApproval
  )
  private card?: HTMLElement
  private resolve?: (approved: boolean) => void
  private signal?: AbortSignal
  private readonly abort = () => this.finish(false, false)

  constructor(
    private readonly container: HTMLElement,
    private readonly options: ChatApprovalOptions
  ) {}

  request(request: WebMCPChatApprovalRequest): Promise<boolean> {
    if (request.signal?.aborted) return Promise.resolve(false)
    this.finish(false, false)
    this.machine.send('request')
    const decision = new Promise<boolean>((resolve) => {
      this.resolve = resolve
    })
    const labels = this.options.getLabels()
    const toolLabel = this.options.getToolLabel?.()
    const card = document.createElement('section')
    card.className = 'approval-card'
    card.setAttribute('part', 'approval')
    card.setAttribute('role', 'group')
    card.setAttribute('aria-label', labels.approvalTitle)

    const reason = document.createElement('p')
    reason.className = 'approval-reason'
    reason.textContent = request.reason
    const tool = document.createElement('p')
    tool.className = 'approval-tool'
    tool.textContent = toolLabel?.(request.toolName) ?? request.toolName
    const input = document.createElement('pre')
    input.className = 'approval-input'
    input.textContent = summarize(request.input)
    const actions = document.createElement('div')
    actions.className = 'approval-actions'
    const deny = document.createElement('button')
    deny.type = 'button'
    deny.textContent = labels.deny
    const approve = document.createElement('button')
    approve.type = 'button'
    approve.className = 'approval-approve'
    approve.textContent = labels.approve
    actions.append(deny, approve)
    card.append(reason, tool, input, actions)
    this.card = card
    this.container.replaceChildren(card)

    deny.addEventListener('click', () => this.finish(false, true))
    approve.addEventListener('click', () => this.finish(true, true))
    if (request.signal) {
      this.signal = request.signal
      request.signal.addEventListener('abort', this.abort, { once: true })
    }
    this.options.onOpen?.()
    card.scrollIntoView?.({ block: 'nearest' })
    deny.focus({ preventScroll: true })
    return decision
  }

  /** Denies a pending card, for example when the element disconnects or its controller changes. */
  cancel(): void {
    this.finish(false, false)
  }

  private finish(approved: boolean, fromUser: boolean) {
    if (this.machine.state !== 'pending') return
    this.machine.send('settle')
    this.signal?.removeEventListener('abort', this.abort)
    this.signal = undefined
    this.card?.remove()
    this.card = undefined
    const resolve = this.resolve
    this.resolve = undefined
    this.options.onResolve?.(approved, fromUser)
    resolve?.(approved)
  }
}

function summarize(input: unknown): string {
  try {
    const text = JSON.stringify(input)
    if (typeof text !== 'string') return String(input)
    return text.length > 500 ? `${text.slice(0, 499)}…` : text
  } catch {
    return '[unserializable input]'
  }
}
