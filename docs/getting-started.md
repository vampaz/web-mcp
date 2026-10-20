# Getting started

The [integration walkthrough](./integration.md) is the primary path: register one tool, add an offline command input, then optionally add persistent chat.

## Dependency model

WebMCP Kit is one ESM package. Core, command input, Pi, chat, devtools, testing, and the local bridge require no framework. Pi's implementation libraries are bundled into the distribution and remain isolated from core/chat imports.

Install `vue` for `/vue`, `react` for `/react`, `svelte` for `/svelte`, or `zod` for `/zod`. The accepted peer ranges are Vue 3.3+, React 18+, Svelte 4+, and Zod 4+. A declared range is not evidence that every version has been tested. The package uses Node 22.19+ for tooling; this repository's development version is in `.nvmrc`.

Browser capabilities depend on the chosen surface; see [operations](./operations.md#browser-prerequisites). The kit supplies no default hosted inference endpoint. An offline core installation does not contact the demo service.
