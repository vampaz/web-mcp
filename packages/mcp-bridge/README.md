# @webmcp-kit/mcp-bridge

Local MCP-style bridge over the active WebMCP Kit fallback registry. It exposes tool listing and invocation helpers for local development, demos, and experiments.

```ts
import { createLocalMCPBridge } from '@webmcp-kit/mcp-bridge'

const bridge = createLocalMCPBridge()
const tools = bridge.listTools()
```
