import { act, createElement, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineTool, invokeTool, listTools, type WebMCPTool } from '@vampaz/webmcp-kit'
import { clearToolsForTest } from '@vampaz/webmcp-kit/testing'
import { useWebMCPTool, useWebMCPTools } from './index'

beforeEach(function actEnvironment() {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

const roots = new Set<Root>()

function createTestRoot(target: HTMLElement): Root {
  const root = createRoot(target)
  roots.add(root)
  return root
}

async function unmountRoot(root: Root) {
  await act(async function unmount() {
    root.unmount()
  })
  roots.delete(root)
}

afterEach(async function cleanup() {
  for (const root of roots) {
    try {
      await act(async function unmount() {
        root.unmount()
      })
    } catch {
      // The test may have already unmounted a root before failing.
    }
  }
  roots.clear()
  clearToolsForTest()
  document.body.replaceChildren()
})

function App(props: { tool: WebMCPTool; revision: number }) {
  useWebMCPTool(props.tool)
  return createElement('p', null, String(props.revision))
}

function ToolSet(props: { tools: WebMCPTool[]; revision: number }) {
  useWebMCPTools(props.tools)
  return createElement('p', null, String(props.revision))
}

describe('React runtime', function runtime() {
  it('keeps one registration through StrictMode, rerenders, and in-flight calls', async function flight() {
    let start!: () => void
    let finish!: (value: unknown) => void
    const started = new Promise<void>(function wait(resolve) {
      start = resolve
    })
    const tool = defineTool({
      name: 'react_runtime_read',
      description: 'Read a value from the mounted React runtime component.',
      execute() {
        start()
        return new Promise<unknown>(function wait(resolve) {
          finish = resolve
        })
      }
    })
    const nextTool = defineTool({
      name: 'react_runtime_read',
      description: 'Read a value from the mounted React runtime component.',
      execute() {
        return { source: 'second' }
      }
    })

    const target = document.createElement('div')
    document.body.append(target)
    const root = createTestRoot(target)
    await act(async function render() {
      root.render(createElement(StrictMode, null, createElement(App, { tool, revision: 0 })))
    })

    expect(listTools().map((registration) => registration.tool.name)).toEqual([
      'react_runtime_read'
    ])

    const pending = invokeTool({ toolName: 'react_runtime_read', input: {} })
    await started
    await act(async function rerender() {
      root.render(
        createElement(StrictMode, null, createElement(App, { tool: nextTool, revision: 1 }))
      )
    })
    expect(listTools()).toHaveLength(1)

    finish({ source: 'first' })
    await expect(pending).resolves.toMatchObject({
      status: 'success',
      output: { source: 'first' }
    })
    await expect(invokeTool({ toolName: 'react_runtime_read', input: {} })).resolves.toMatchObject({
      status: 'success',
      output: { source: 'second' }
    })

    await unmountRoot(root)
    expect(listTools()).toEqual([])
  })

  it('mounts an atomic tool set under StrictMode and removes it on unmount', async function set() {
    const tools = [
      defineTool({
        name: 'react_runtime_first',
        description: 'Run the first React runtime tool from the mounted component.',
        execute() {
          return 'first'
        }
      }),
      defineTool({
        name: 'react_runtime_second',
        description: 'Run the second React runtime tool from the mounted component.',
        execute() {
          return 'second'
        }
      })
    ]
    const target = document.createElement('div')
    document.body.append(target)
    const root = createTestRoot(target)
    await act(async function render() {
      root.render(createElement(StrictMode, null, createElement(ToolSet, { tools, revision: 0 })))
    })

    expect(listTools().map((registration) => registration.tool.name)).toEqual([
      'react_runtime_first',
      'react_runtime_second'
    ])

    await unmountRoot(root)
    expect(listTools()).toEqual([])
  })
})
