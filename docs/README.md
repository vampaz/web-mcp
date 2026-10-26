# Developer documentation

WebMCP Kit exposes application actions through one registry and invocation pipeline. Add a model provider adapter (the kit calls it a `resolver`) for commands, a Pi controller for persistent conversations, and the chat component when you want a supplied interface.

This checkout targets 0.5.1. Apply the [0.5 migration guide](./migration-0.5.md) when upgrading from 0.4, after the [0.4 guide](./migration-0.4.md) for older versions. Pi runs in the page; its implementation libraries are bundled.

## Start here

| Task                                                                   | Guide                                                                      |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Upgrade from 0.4                                                       | [Upgrading to 0.5.0](./migration-0.5.md)                                   |
| Upgrade from 0.3                                                       | [Upgrading to 0.4.0](./migration-0.4.md), then [0.5.0](./migration-0.5.md) |
| Upgrade an application that used the planner API                       | [Upgrading to 0.3.0](./migration-0.3.md)                                   |
| Integrate tools and optional chat into an application                  | [Integration walkthrough](./integration.md)                                |
| Understand execution, persistence, and ownership                       | [Architecture and diagrams](./architecture.md)                             |
| Look up defaults, errors, events, and lifecycle behavior               | [API behavior](./api-behavior.md)                                          |
| Find every exported function, overload, interface, and type            | [Complete API reference](./api-reference.md)                               |
| Prepare HTTPS, CSP, tests, and deployment                              | [Operations and troubleshooting](./operations.md)                          |
| Register a first tool and call it without a model                      | [Getting started](./getting-started.md)                                    |
| Understand runtime dependencies, optional peers, and development tools | [Dependency model](./getting-started.md#dependency-model)                  |
| Choose a resolver and implement a server endpoint                      | [Resolver providers](./resolver-providers.md)                              |
| Run a headless persistent conversation                                 | [Pi harness](./pi.md)                                                      |
| Configure inline or popup chat and its styles                          | [Chat UI](./chat.md)                                                       |
| Set approval and authorization boundaries                              | [Security](./security.md)                                                  |
| Evaluate resolver behavior                                             | [Resolver evaluations](./evals.md)                                         |

## Frameworks and runnable examples

- [Vue](./vue.md), [React](./react.md), [Svelte](./svelte.md), and [Astro](./astro.md) cover mounting and teardown.
- [Framework extensions](./framework-extensions.md) describes tool registration helpers and reactive availability.
- [Examples](./examples.md) covers common tool definitions and form integration.
- The [local lab](https://github.com/vampaz/web-mcp/blob/master/apps/demo/README.md) opens in Chat, with tabs ordered Chat, Harness, Core, Toolkit, on the TLS plugin's HTTPS domain.
- The [isolated Vite + Vue consumer](https://github.com/vampaz/web-mcp/tree/master/tests/fixtures/pi-chat) installs the package artifact and runs below a nested path. Its deterministic resolver makes the fixture reproducible without a model service. These repository-only links use GitHub URLs so they also work from the installed package docs.

## Keep documentation current

Edit the explanatory guides when behavior changes. Regenerate the exhaustive API contracts with `npm run docs:api`; do not edit `api-reference.md` by hand. `npm run docs:api:check` compares the reference with all public exports. Package-consumer tests typecheck the public declarations and the integration example.
