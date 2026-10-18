# Developer documentation

WebMCP Kit exposes application actions through one registry and invocation pipeline. Add a planner for commands, a Pi controller for persistent conversations, and the chat component when you want a supplied interface.

The `/pi`, `/pi/worker`, and `/chat` additions were introduced in `0.2.0`. Install `0.2.1` or newer so npm also installs their runtime dependencies automatically.

## Start here

| Task                                                                   | Guide                                                     |
| ---------------------------------------------------------------------- | --------------------------------------------------------- |
| Integrate tools, a worker, and chat into an application                | [Integration walkthrough](./integration.md)               |
| Understand execution, persistence, and ownership                       | [Architecture and diagrams](./architecture.md)            |
| Look up defaults, errors, events, and lifecycle behavior               | [API behavior](./api-behavior.md)                         |
| Find every exported function, overload, interface, and type            | [Complete API reference](./api-reference.md)              |
| Prepare HTTPS, worker assets, CSP, tests, and deployment               | [Operations and troubleshooting](./operations.md)         |
| Add core tools without a conversation runtime                          | [Getting started](./getting-started.md)                   |
| Understand runtime dependencies, optional peers, and development tools | [Dependency model](./getting-started.md#dependency-model) |
| Choose a planner and implement a server endpoint                       | [Planner providers](./planner-providers.md)               |
| Run a headless persistent conversation                                 | [Pi harness](./pi.md)                                     |
| Configure inline or popup chat and its styles                          | [Chat UI](./chat.md)                                      |
| Set approval and authorization boundaries                              | [Security](./security.md)                                 |
| Evaluate planner behavior                                              | [Planner evaluations](./evals.md)                         |

## Frameworks and runnable examples

- [Vue](./vue.md), [React](./react.md), [Svelte](./svelte.md), and [Astro](./astro.md) cover mounting and teardown.
- [Framework extensions](./framework-extensions.md) describes tool registration helpers and reactive availability.
- [Examples](./examples.md) covers common tool definitions and form integration.
- The [local lab](../apps/demo/README.md) opens in Chat, with tabs ordered Chat, Harness, Core, on the TLS plugin's HTTPS domain.
- The [isolated Vite + Vue consumer](../tests/fixtures/pi-chat) installs the package artifact, compiles its own worker, and runs below a nested path. Its deterministic planner makes the fixture reproducible without a model service.
- [Standalone demo adoption](./demo-integration.md) explains migration boundaries for the separate demo repository.

## Keep documentation current

Edit the explanatory guides when behavior changes. Regenerate the exhaustive API contracts with `npm run docs:api`; do not edit `api-reference.md` by hand. `npm run docs:api:check` compares the reference with all public exports. Package-consumer tests typecheck the public declarations and the integration example.
