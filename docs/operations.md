# Operations and troubleshooting

[Documentation index](./README.md) · [Integration](./integration.md) · [API behavior](./api-behavior.md)

## Browser prerequisites

Feature-detect the capabilities your integration uses. Native WebMCP and Chrome AI are optional; they are separate from the requirements for persistent Pi conversations.

| Integration           | Required browser capabilities                                                      |
| --------------------- | ---------------------------------------------------------------------------------- |
| Core fallback tools   | The JavaScript and DOM APIs used by your application; no native WebMCP requirement |
| Command input or chat | Custom Elements and Shadow DOM; the chat layout also uses `ResizeObserver`         |
| Popup chat            | The preceding APIs plus the Popover API                                            |
| `createPiRuntime()`   | IndexedDB and Web Locks in the current browser context                             |
| `createPiHarness()`   | HTTPS secure context, IndexedDB, and Web Locks                                     |
| Chrome AI resolver    | Available `LanguageModel` API and its model/session requirements                   |

Check availability before advertising an integration to users. A missing Pi prerequisite is an error, not a switch to transient history. A missing conversational resolver is an error, not a heuristic conversation. See [browser support](./browser-support.md) for the tested matrix and native registration behavior.

## HTTPS development

Use the HTTPS domain printed by the project's TLS plugin. The repository lab advertises [webmcp-kit.localtest.me](https://webmcp-kit.localtest.me); automated browser tests use [webmcp-kit-tests.localtest.me](https://webmcp-kit-tests.localtest.me). Keep the plugin in the consuming app's page Vite configuration when adding Pi.

Certificate validation must succeed for both the browser and Node processes that probe the fixture. The repository's `scripts/playwright-trust.ts` reads the plugin's CA and adds that CA to Node's trust. CI uses `scripts/setup-test-tls.ts` on a disposable runner to prepare certificate trust and the TLS proxy. Do not run that CI setup script on a developer machine with an existing shared TLS service. Reuse the existing service and trust setup.

Do not replace the advertised URL with an HTTP fixture, enable `ignoreHTTPSErrors`, or disable TLS verification. If a test cannot connect, inspect the plugin's proxy health, advertised hostname, route registration, and certificate chain. The page and WebSocket HMR connection should both use the plugin's secure origin.

The lab's local-model proxy is application server code. Browser requests use a relative endpoint on the HTTPS origin. An internal loopback model transport is not a URL to navigate or expose as the development page.

## CSP, endpoints, and application security

Configure `connect-src` only for the model/resolver endpoints your integration actually uses. The app-owned server endpoint remains responsible for authentication, authorization, model selection, rate limits, and credential handling.

Test the supplied components under your production Content Security Policy. They create shadow DOM through `innerHTML` and install inline shadow styles. The kit currently has no Trusted Types policy injection or style nonce option. A policy requiring Trusted Types or prohibiting those styles can prevent these components from rendering. A headless controller with application-owned UI is available when the supplied component cannot satisfy the host's policy. Do not weaken a site-wide policy without reviewing the concrete integration.

Pi's bundled libraries validate tool arguments with TypeBox. On first use TypeBox tests whether it can compile validators with `new Function`. Under a policy without `'unsafe-eval'` the browser may report one CSP violation for that probe; TypeBox then uses its slower interpreted validator and Pi keeps working. Do not add `'unsafe-eval'` for this.

Tool and assistant text is displayed as text, not interpreted as model-provided HTML. This does not make tool inputs trusted. Keep input validation, current-state guards, app-owned approval, and server authorization in the execution path. Native callers, resolvers, test helpers, devtools, and the local bridge use the core invocation rules.

`ownerId` partitions browser history; it does not authenticate or encrypt it. Scripts on the same origin can access that origin's storage. Store only necessary conversation data. Destroy old controllers on account changes and apply the application's history-retention policy. On sign-out, call `deletePiConversations({ namespace, ownerId })` after destroying that account's controllers; IndexedDB database names include the owner partition. Clearing history does not undo application actions.

## Validation in this repository

Install with `npm ci`. Installation does not build the package. Use the Node version specified by `.nvmrc` or a compatible version permitted by `package.json`.

For implementation changes, `npm run check` runs lint, format, both typechecks, API and link checks, and unit tests. Then run the browser suite:

```sh
npm run check
npm run test:e2e
```

`npm run test:coverage` reports unit coverage. `npm run docs:links` checks relative links and anchors in the documentation. `npm run dev:demo:fixtures` starts the separate test server at `https://webmcp-kit-tests.localtest.me` with deterministic responses and isolated test conversations. The normal demo never substitutes test responses for an unavailable model.

The ordinary browser suite uses deterministic fixtures; it needs no model inference. The configured matrix includes Chromium, Firefox, WebKit, and native Chromium. On macOS, Firefox uses isolated app data under `test-results/firefox-home` through `CFFIXED_USER_HOME`; this avoids accessing the personal Firefox directory protected by macOS 27. Remove this workaround when Playwright includes the [Firefox 158 fix](https://github.com/microsoft/playwright/issues/42768). Certificate validation stays enabled. A configured project is not evidence that its tests passed.

For a packaging change or a release candidate, build once after the source and documentation are ready:

```sh
npm run build
npm run pack:package
npm run test:package
```

`pack:package` writes `artifacts/webmcp-kit.tgz` and adjacent JSON metadata. The source digest includes package sources, declarations' configuration, package manifests, README, and documentation. Consumer checks reject an artifact whose digest or bytes differ. `test:package` never rebuilds the library; it runs isolated consumers of the installed tarball.

The package suite checks distribution contents, strict consumer declarations, core/chat imports without framework peers, SSR imports, one shared registry, and Pi/chat under a nested base path on trusted HTTPS. The Pi consumer installs the kit without declaring its internal runtime libraries. The suite also typechecks the shipped [integration example](./examples/counter-assistant.ts). Source aliases are disabled in these consumers.

Run `npm audit` for advisories and `npm audit signatures` for registry verification after dependency changes. These checks answer different questions from runtime tests. The checks workflow validates and tests a tarball before uploading it. The release workflow validates a fresh artifact and publishes those tested bytes. Neither local checks nor a build prove publication or deployment.

`npm run test:lmstudio` is a separate real-model suite. Configure the lab's documented local provider first and run it only when model inference is intended. It does not substitute for deterministic regression coverage. See the [repository lab README](https://github.com/vampaz/web-mcp/blob/master/apps/demo/README.md) for provider configuration and browser commands; repository-only files are not included in the npm tarball.

## Release procedure

The release workflow skips cleanly only when npm, GitHub Packages, and the GitHub release all have the version; a partially published version can be completed by rerunning it. Version 0.5.0 changes approval, schema, chat, and Pi contracts. Apply the [migration guide](./migration-0.5.md) before updating consumers.

1. Finish the review and validation above on the release branch, including the packed consumer tests. Check the manifest and lockfile versions together.
2. Check `npm view @vampaz/webmcp-kit versions --json` and confirm the candidate version is unused. A registry or authentication error does not establish that a version is available.
3. Verify the npm trusted publisher permits publishing from `vampaz/web-mcp`, workflow `release.yml`, on GitHub-hosted runners, and that the `npm-release` environment has protection rules. Only the publish job holds `id-token: write`; a local npm login is not used by this release path.
4. After authorization to release, merge the reviewed revision into `master`. The workflow also permits manual runs on `master`, for recovery. Publication runs are not cancelled when another commit arrives.
5. Wait for validation, npm publication, GitHub Packages publication, and GitHub release creation. A partial failure needs inspection before rerunning; a successful npm publication cannot be overwritten.
6. Verify the registry version, provenance, and installed exports. Downstream applications can then replace a temporary Git or tarball dependency with the published version, update their lockfiles, and rerun consumer checks before deployment.

The workflow has three jobs. `prepare` reads which targets already have the version. `verify` runs the shared validation with read-only permissions and no caches, builds once, tests `artifacts/webmcp-kit.tgz`, and uploads it. `publish` runs in the protected `npm-release` environment, checks the artifact's digest and version, and publishes only the missing targets from those tested bytes. Third-party actions are pinned to commit SHAs. Do not substitute a fresh working-directory pack after the consumer tests. Keep release authorization, CI success, registry publication, and downstream production verification separate.

## Troubleshooting

When a deployed HTTPS app connects directly to LM Studio on this device, the browser may ask for
permission to access local apps. Start the LM Studio server, enable its CORS option, and grant the
site permission if you intend to use that local model. Model discovery has a ten-second deadline;
if the permission prompt outlasts it, grant access and retry discovery. `listLmStudioModels()` reports
connection and timeout failures with these recovery steps and preserves caller cancellation.

| Symptom                                      | Inspect and correct                                                                                                                                                                                                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unknown planner export such as `ToolPlanner` | Planner names were removed in `0.3.0`. Rename them with the [0.3 guide](./migration-0.3.md), then apply the [0.4](./migration-0.4.md) and [0.5](./migration-0.5.md) API changes when upgrading to the current release.                                           |
| `/pi` or `/chat` cannot be resolved          | Check the installed version and its package exports. Both entries are present in `0.5.0`; install the current release and apply its migration guides.                                                                                                            |
| No tools discovered                          | Check component mounting, `when`, `scope()`, stable names, and duplicate copies of the kit. Use `listTools()` and the integration health report in the page.                                                                                                     |
| Native registration fails but fallback works | Await registration `ready`, inspect `warnings`, and detect the actual browser API. Fallback availability does not prove native registration.                                                                                                                     |
| `configuration` or `unsupported`             | Check session fields, limits, browser capabilities, and conversational resolver availability. Handle initialization rejection in the host.                                                                                                                       |
| `conversation_busy`                          | Another controller/tab owns the operation. Wait for it to finish or stop it through its own UI. Do not automatically steal or retry the action.                                                                                                                  |
| `stale_document`                             | Cancellation, a continually changing catalog, or a change immediately before invocation invalidated the request. Pi refreshes stable catalog changes before inference and discards choices made during a catalog change. Start a new turn after this error.      |
| `action_denied`                              | The user declined. Leave the turn stopped and allow a new explicit request.                                                                                                                                                                                      |
| `provider_failed`                            | Inspect the endpoint and model response, permissions, truncation, and `singleStep` contract. Do not silently substitute another model.                                                                                                                           |
| `limit_reached`                              | Automatic compaction reduces older model context. A single large input, result, catalog, or application context can still exceed the request limit. Reduce that payload or choose valid bounded limits. The tool-call and stored-history limits remain separate. |
| `storage_failed` or missing history          | Check browser storage settings, quota, eviction, account partition, and blocked database operations. Persistence is not guaranteed by the browser.                                                                                                               |
| Popup is clipped or unavailable              | Verify Popover API support, `ResizeObserver`, and the production CSP. Use the documented CSS variables and test small/zoomed viewports.                                                                                                                          |
| Stop returns but a server action completed   | Cancellation is cooperative after dispatch. Use application-specific idempotency and state checks; Stop is not rollback.                                                                                                                                         |

Subscribe to controller snapshots for state and errors. Core events may contain input and output data; redact diagnostics before logging them. Capture the package version/artifact digest, browser features, session partition identifiers appropriate for logging, and error code when reporting a failure. Do not include credentials or private conversation contents by default.
