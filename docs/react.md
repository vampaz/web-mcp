# React Hook

Use `useWebMCPTool` to register a tool while the component is mounted. The hook registers after commit and keeps registration stable across inline rerenders. It updates callbacks after each committed render. Changing schemas, metadata, or availability replaces the registration and invalidates pending calls. `when` is a boolean computed during render, so derive it from props, state, or your router.

```tsx
import { defineTool } from '@vampaz/webmcp-kit'
import { useWebMCPTool } from '@vampaz/webmcp-kit/react'

export function CartTools({ isCartRoute }: { isCartRoute: boolean }) {
  useWebMCPTool(
    defineTool({
      name: 'add_to_cart',
      description: 'Add a known product to the current cart.',
      inputSchema: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
          quantity: { type: 'integer', minimum: 1 }
        },
        required: ['productId', 'quantity'],
        additionalProperties: false
      },
      execute(input) {
        return input
      }
    }),
    {
      when: isCartRoute
    }
  )

  return null
}
```

The parent derives `isCartRoute` from its router. Replace the sample's echoed input with the existing cart action and add confirmation when the action affects important state.

The hook returns the same handle shape as the Vue and Svelte helpers:

```tsx
const cartTool = useWebMCPTool(addToCartTool)

cartTool.getRegistration() // current RegisteredTool or undefined
cartTool.unregister() // unregister before unmount when needed
```

## Independent conversation UI

Use the shared [Pi controller](./pi.md) and [chat custom element](./chat.md) for persistent conversations. Configure model access in application code, mount the element in the browser, and call `harness.destroy()` during teardown. If initialization finishes after unmount, destroy that late controller instead of attaching it. Core framework helpers still own tool registration and cleanup.

`harnessOptions` is application-owned configuration from the Pi setup guide. Show initialization errors in the host's error UI.

```tsx
import { useEffect, useRef, useState } from 'react'
import { createPiHarness, type PiController } from '@vampaz/webmcp-kit/pi'
import { defineWebMCPChat, type WebMCPChatElement } from '@vampaz/webmcp-kit/chat'
import { harnessOptions } from './assistant-config'

export function Assistant() {
  const container = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  useEffect(function mount() {
    let closed = false
    let harness: PiController | undefined
    defineWebMCPChat()
    void createPiHarness(harnessOptions)
      .then(async function connected(next) {
        if (closed) {
          await next.destroy()
          return
        }
        harness = next
        const chat = document.createElement('webmcp-chat') as WebMCPChatElement
        chat.configure({ controller: harness })
        container.current?.append(chat)
      })
      .catch(function failed(cause) {
        if (!closed)
          setError(cause instanceof Error ? cause.message : 'The assistant could not start.')
      })
    return function cleanup() {
      closed = true
      container.current?.replaceChildren()
      void harness?.destroy()
    }
  }, [])
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <div ref={container} />
    </>
  )
}
```

## Register several tools

`useWebMCPTools(tools, options?)` registers a list atomically. It re-registers only when a tool's definition or `when` changes; inline tool literals keep their registration and in-flight calls use the latest committed callbacks.

```tsx
import { useWebMCPTools } from '@vampaz/webmcp-kit/react'

function Cart({ hasCart }: { hasCart: boolean }) {
  useWebMCPTools([readCartTool, addToCartTool], { when: hasCart })
  return null
}
```
