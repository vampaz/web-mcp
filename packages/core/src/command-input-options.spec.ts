import { afterEach, expect, it, vi } from 'vitest'
import { defineWebMCPCommandInput } from './command-input'
import type {
  WebMCPCommandInputElement,
  WebMCPCommandInputResolverOption
} from './interfaces/command-input'
import type { ToolResolution, ToolResolver } from './interfaces/tool'

let sequence = 0

afterEach(function cleanup() {
  document.body.replaceChildren()
})

function resolver(name = 'Fixture'): ToolResolver {
  return {
    name,
    available: true,
    status: 'ready',
    detail: 'Ready.',
    async resolve() {
      return { toolName: 'needs_clarification', input: {}, confidence: 0, reason: 'Which item?' }
    }
  }
}

function choices(): WebMCPCommandInputResolverOption[] {
  return [
    {
      id: 'first',
      label: 'First provider',
      modelOptions: [
        { label: 'Small', model: 'small' },
        { label: 'Large', model: 'large' }
      ],
      createResolver: vi.fn(function create() {
        return resolver('First')
      })
    },
    {
      id: 'second',
      label: 'Second provider',
      createResolver: vi.fn(function create() {
        return resolver('Second')
      })
    }
  ]
}

function element(): WebMCPCommandInputElement {
  const tag = `webmcp-options-test-${sequence++}`
  defineWebMCPCommandInput(tag)
  return document.createElement(tag) as WebMCPCommandInputElement
}

function select(input: WebMCPCommandInputElement, name: string): HTMLSelectElement {
  return input.shadowRoot!.querySelector<HTMLSelectElement>(`[data-${name}]`)!
}

it('shows and uses the first supplied resolver without an explicit initial ID', async function first() {
  const input = element()
  const options = choices()
  input.configure({ resolverOptions: options })
  document.body.append(input)
  expect(select(input, 'provider').value).toBe('first')
  await input.run('Read')
  expect(options[0]!.createResolver).toHaveBeenCalledOnce()
  expect(options[1]!.createResolver).not.toHaveBeenCalled()
})

it('honors an initial resolver and keeps a later user selection on cosmetic configuration', async function selection() {
  const input = element()
  const config = { resolverOptions: choices(), initialResolverOptionId: 'second' }
  input.configure(config)
  document.body.append(input)
  expect(select(input, 'provider').value).toBe('second')
  select(input, 'provider').value = 'first'
  select(input, 'provider').dispatchEvent(new Event('change'))
  input.configure({ ...config, placeholder: 'Ask' })
  expect(select(input, 'provider').value).toBe('first')
  await input.run('Read')
  expect(config.resolverOptions[0]!.createResolver).toHaveBeenCalledOnce()
})

it('falls back to the first offered choice for an unknown initial ID', function unknown() {
  const input = element()
  input.configure({ resolverOptions: choices(), initialResolverOptionId: 'missing' })
  document.body.append(input)
  expect(select(input, 'provider').value).toBe('first')
})

it('uses an offered model when a refreshed list removes the selected model', async function models() {
  const input = element()
  input.configure({ resolverOptions: choices(), initialModel: 'large' })
  document.body.append(input)
  const options = choices()
  options[0]!.modelOptions = [
    { label: 'New', model: 'new' },
    { label: 'Small', model: 'small' }
  ]
  input.configure({ resolverOptions: options })
  expect(select(input, 'model').value).toBe('new')
  await input.run('Read')
  expect(options[0]!.createResolver).toHaveBeenCalledWith({
    model: 'new',
    modelOption: { label: 'New', model: 'new' }
  })
})

it('shares a pending resolver between initialization and an immediate command', async function pending() {
  const input = element()
  let finish!: (value: ToolResolver) => void
  const create = vi.fn(function create() {
    return new Promise<ToolResolver>(function wait(resolve) {
      finish = resolve
    })
  })
  input.configure({
    resolverOptions: [{ id: 'pending', label: 'Pending', createResolver: create }]
  })
  document.body.append(input)
  const running = input.run('Read')
  await vi.waitFor(function created() {
    expect(create).toHaveBeenCalledOnce()
  })
  finish(resolver())
  await running
  expect(create).toHaveBeenCalledOnce()
})

it('disposes a resolver that finishes loading after it has been replaced', async function stale() {
  const input = element()
  let finish!: (value: ToolResolver) => void
  input.configure({
    resolverOptions: [
      {
        id: 'pending',
        label: 'Pending',
        createResolver() {
          return new Promise(function wait(resolve) {
            finish = resolve
          })
        }
      }
    ]
  })
  document.body.append(input)
  await vi.waitFor(function started() {
    expect(finish).toBeTypeOf('function')
  })
  input.configure({ resolver: resolver('Replacement') })
  const dispose = vi.fn()
  finish({ ...resolver('Old'), dispose })
  await vi.waitFor(function disposed() {
    expect(dispose).toHaveBeenCalledOnce()
  })
  expect(input.resolver?.name).toBe('Replacement')
})

it('keeps a command running when labels, context, and disclosure settings change', async function cosmetic() {
  const input = element()
  let finish!: (value: ToolResolution) => void
  let signal: AbortSignal | undefined
  input.resolver = {
    ...resolver(),
    resolve(_message, _tools, _context, options) {
      signal = options?.signal
      return new Promise(function wait(resolve) {
        finish = resolve
      })
    }
  }
  document.body.append(input)
  const running = input.run('Read')
  await vi.waitFor(function started() {
    expect(finish).toBeTypeOf('function')
  })
  input.configure({
    buttonLabel: 'Go',
    placeholder: 'Ask',
    context: { count: 2 },
    settingsOpen: true
  })
  expect(signal?.aborted).toBe(false)
  finish({ toolName: 'needs_clarification', input: {}, confidence: 0, reason: 'Which item?' })
  expect(await running).toMatchObject({ status: 'blocked' })
})

it('creates one resolver per model selection and preserves the focused control', async function model() {
  const input = element()
  const options = choices()
  input.configure({ resolverOptions: options })
  document.body.append(input)
  await vi.waitFor(function ready() {
    expect(options[0]!.createResolver).toHaveBeenCalledOnce()
  })
  const model = select(input, 'model')
  model.focus()
  model.value = 'large'
  model.dispatchEvent(new Event('input'))
  model.dispatchEvent(new Event('change'))
  await vi.waitFor(function updated() {
    expect(options[0]!.createResolver).toHaveBeenCalledTimes(2)
  })
  expect(options[0]!.createResolver).toHaveBeenLastCalledWith({
    model: 'large',
    modelOption: options[0]!.modelOptions![1]
  })
  expect(input.shadowRoot!.activeElement).toBe(select(input, 'model'))
  const provider = select(input, 'provider')
  provider.focus()
  provider.value = 'second'
  provider.dispatchEvent(new Event('change'))
  expect(input.shadowRoot!.activeElement).toBe(select(input, 'provider'))
})

it('rejects ambiguous choices before changing the active resolver', function invalid() {
  const input = element()
  const current = resolver()
  input.resolver = current
  const options = choices()
  expect(function duplicate() {
    input.configure({ resolverOptions: [options[0]!, options[0]!] })
  }).toThrow('unique')
  expect(input.resolver).toBe(current)
  expect(function ambiguous() {
    // @ts-expect-error The runtime also rejects ambiguous JavaScript configuration.
    input.configure({ resolver: current, resolverOptions: options })
  }).toThrow('either')
})

it('does not read provider credentials or endpoints from DOM attributes', async function attributes() {
  const input = element()
  const configured = resolver()
  const resolve = vi.spyOn(configured, 'resolve')
  input.resolver = configured
  input.setAttribute('api-key', 'not-a-real-key')
  input.setAttribute('endpoint', 'https://invalid.example')
  input.setAttribute('provider', 'openai')
  document.body.append(input)
  await input.run('Read')
  expect(resolve).toHaveBeenCalledOnce()
  expect(input.resolver).toBe(configured)
})

it('shows clarification and provider errors as visible status feedback', async () => {
  const input = element()
  const provider = resolver()
  input.configure({ resolver: provider })
  document.body.append(input)
  await input.run('Read')
  expect(input.shadowRoot?.querySelector('[role="status"]')?.textContent).toBe('Which item?')
  provider.resolve = async function fail() {
    throw new Error('Provider is offline')
  }
  await input.run('Read')
  expect(input.shadowRoot?.querySelector('[role="status"]')?.textContent).toBe(
    'Provider is offline'
  )
})
