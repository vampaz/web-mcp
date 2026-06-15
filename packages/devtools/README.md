# @vampaz/webmcp-kit/devtools

In-page developer overlay for inspecting registered WebMCP Kit tools, viewing integration diagnostics, generating sample input, invoking tools, and replaying recent invocations.

```ts
import { mountDevtoolsOverlay } from '@vampaz/webmcp-kit/devtools'

const devtools = mountDevtoolsOverlay({ initiallyOpen: true })

devtools.destroy()
```
