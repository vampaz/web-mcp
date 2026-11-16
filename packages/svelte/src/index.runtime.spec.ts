import { mount, tick, unmount } from 'svelte'
import { writable } from 'svelte/store'
import { afterEach, describe, expect, it } from 'vitest'
import { defineTool, invokeTool, listTools, type WebMCPTool } from '@vampaz/webmcp-kit'
import { clearToolsForTest } from '@vampaz/webmcp-kit/testing'
import Component from './runtime-component.svelte'

type MountedComponent = ReturnType<typeof mount>

const mountedComponents: MountedComponent[] = []

async function unmountComponent(instance: MountedComponent) {
  await unmount(instance)
  const index = mountedComponents.indexOf(instance)
  if (index >= 0) mountedComponents.splice(index, 1)
}

afterEach(async function cleanup() {
  for (const instance of mountedComponents.splice(0)) {
    try {
      await unmount(instance)
    } catch {
      // The test may have already unmounted a component before failing.
    }
  }
  clearToolsForTest()
  document.body.replaceChildren()
})

function mountComponent(tool: WebMCPTool, tools: readonly WebMCPTool[] = []) {
  const target = document.createElement('div')
  document.body.append(target)
  const revision = writable(0)
  const instance = mount(Component, {
    target,
    props: { tool, tools, revision }
  })
  mountedComponents.push(instance)
  return { instance, revision }
}

describe('Svelte runtime', function runtime() {
  it('keeps one registration through an in-flight rerender and unregisters on destroy', async function flight() {
    let finish!: (value: unknown) => void
    const tool = defineTool({
      name: 'svelte_runtime_read',
      description: 'Read a value from the mounted Svelte runtime component.',
      execute() {
        return new Promise<unknown>(function wait(resolve) {
          finish = resolve
        })
      }
    })
    const { instance, revision } = mountComponent(tool)
    await tick()

    expect(listTools().map((registration) => registration.tool.name)).toEqual([
      'svelte_runtime_read'
    ])

    const pending = invokeTool({ toolName: 'svelte_runtime_read', input: {} })
    revision.set(1)
    await tick()
    expect(listTools()).toHaveLength(1)

    finish({ ok: true })
    await expect(pending).resolves.toMatchObject({ status: 'success', output: { ok: true } })

    await unmountComponent(instance)
    await tick()
    expect(listTools()).toEqual([])
  })

  it('registers an atomic tool set and removes it on destroy', async function set() {
    const single = defineTool({
      name: 'svelte_runtime_single',
      description: 'Run the singleton Svelte runtime tool from the mounted component.',
      execute() {
        return 'single'
      }
    })
    const first = defineTool({
      name: 'svelte_runtime_first',
      description: 'Run the first Svelte runtime tool from the mounted component.',
      execute() {
        return 'first'
      }
    })
    const second = defineTool({
      name: 'svelte_runtime_second',
      description: 'Run the second Svelte runtime tool from the mounted component.',
      execute() {
        return 'second'
      }
    })
    const { instance } = mountComponent(single, [first, second])
    await tick()

    expect(listTools().map((registration) => registration.tool.name)).toEqual([
      'svelte_runtime_single',
      'svelte_runtime_first',
      'svelte_runtime_second'
    ])

    await unmountComponent(instance)
    await tick()
    expect(listTools()).toEqual([])
  })
})
