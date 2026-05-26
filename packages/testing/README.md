# @webmcp-kit/testing

Playwright helpers for apps that install `installWebMCPKitTestBridge()` from `@webmcp-kit/core`.

```ts
import { invokeWebMCPTool, waitForWebMCPTool } from '@webmcp-kit/testing/playwright'

await waitForWebMCPTool(page, 'select_items')
await invokeWebMCPTool(page, {
  toolName: 'select_items',
  input: { ids: ['item_4'] },
  source: 'planner'
})
```
