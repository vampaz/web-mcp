# Operations and troubleshooting

[Documentation index](./README.md) · [Integration](./integration.md) · [API behavior](./api-behavior.md)

## Browser prerequisites

Feature-detect the capabilities your integration uses. Native WebMCP and Chrome AI are optional; they are separate from the requirements for persistent Pi conversations.

| Integration           | Required browser capabilities                                                               |
| --------------------- | ------------------------------------------------------------------------------------------- |
| Core fallback tools   | The JavaScript and DOM APIs used by your application; no native WebMCP requirement          |
| Command input or chat | Custom Elements and Shadow DOM; the chat layout also uses `ResizeObserver`                  |
| Popup chat            | The preceding APIs plus the Popover API                                                     |
| `createPiRuntime()`   | IndexedDB and Web Locks in the current browser context                                      |
| `createPiHarness()`   | HTTPS secure context, service workers, IndexedDB, Web Locks, and a valid same-origin worker |
| Chrome AI resolver    | Available `LanguageModel` API and its model/session requirements                            |

Check availability before advertising an integration to users. A missing Pi prerequisite is an error, not a switch to transient history. A missing conversational resolver is an error, not a heuristic conversation. See [browser support](./browser-support.md) for the tested matrix and native registration behavior.

## HTTPS development

Use the HTTPS domain printed by the project's TLS plugin. The repository lab advertises [webmcp-kit.localtest.me](https://webmcp-kit.localtest.me); automated browser tests use [webmcp-kit-tests.localtest.me](https://webmcp-kit-tests.localtest.me). Keep the plugin in the consuming app's page Vite configuration when adding the separate worker configuration.

Certificate validation must succeed for both the browser and Node processes that probe the fixture. The repository's `scripts/playwright-trust.ts` reads the plugin's CA and adds that CA to Node's trust. CI uses `scripts/setup-test-tls.ts` on a disposable runner to prepare certificate trust and the TLS proxy. Do not run that CI setup script on a developer machine with an existing shared TLS service. Reuse the existing service and trust setup.

Do not replace the advertised URL with an HTTP fixture, enable `ignoreHTTPSErrors`, or disable TLS verification. If a test cannot connect, inspect the plugin's proxy health, advertised hostname, route registration, and certificate chain. The page and WebSocket HMR connection should both use the plugin's secure origin.

The lab's local-model proxy is application server code. Browser requests use a relative endpoint on the HTTPS origin. An internal loopback model transport is not a URL to navigate or expose as the development page.

## Worker assets and updates

Follow the [complete worker recipe](./pi.md#embedded-website). The consumer must compile its own wrapper importing `/pi/worker`. Serving the package entry directly from an arbitrary CDN is not the worker installation contract.

1. Compile the worker into the reserved `public/webmcp-pi/` directory.
2. Compile the page, which copies the generated public assets into its site output.
3. Deploy the page and worker assets together under the correct base path.
4. Request the worker URL over HTTPS and verify a successful JavaScript response with a JavaScript MIME type.
5. Verify the registration's scope and a complete tool turn in the deployed application.

For `/nested/`, register `/nested/webmcp-pi/worker.js` with scope `/nested/webmcp-pi/`. Keep the script inside its non-root scope and on the page's origin. A successful HTML fallback response at the worker URL is a deployment error.

The worker has no fetch handler and does not claim pages. It can coexist with a root PWA worker. If that PWA caches generated assets, configure it so the assistant worker and its dependencies can update. Avoid immutable caching for a stable `worker.js` URL; configure revalidation appropriate to your hosting platform.

The runtime calls `skipWaiting()` during worker installation. An update can interrupt a turn. Show the interruption, preserve the recorded history, and require a new user request before further actions. Page HMR alone does not rebuild a separately compiled worker. During worker development, use the documented watcher and reload after compilation.

## CSP, endpoints, and application security

Allow the same-origin worker through the application's `worker-src` policy. Keep worker bundles self-contained where possible. Configure `connect-src` only for the model/resolver endpoints your integration actually uses. The app-owned server endpoint remains responsible for authentication, authorization, model selection, rate limits, and credential handling.

Test the supplied components under your production Content Security Policy. They create shadow DOM through `innerHTML` and install inline shadow styles. The kit currently has no Trusted Types policy injection or style nonce option. A policy requiring Trusted Types or prohibiting those styles can prevent these components from rendering. A headless controller with application-owned UI is available when the supplied component cannot satisfy the host's policy. Do not weaken a site-wide policy without reviewing the concrete integration.

Tool and assistant text is displayed as text, not interpreted as model-provided HTML. This does not make tool inputs trusted. Keep input validation, current-state guards, app-owned approval, and server authorization in the execution path. Native callers, resolvers, test helpers, devtools, and the local bridge use the core invocation rules.

`ownerId` partitions browser history; it does not authenticate or encrypt it. Scripts on the same origin can access that origin's storage. Store only necessary conversation data. Destroy old controllers on account changes and apply the application's history-retention policy. Clearing history does not undo application actions.

## Validation in this repository

Install with `npm ci --ignore-scripts` when you want to prepare dependencies without running the package's `prepare` build. Use the Node version specified by `.nvmrc` or a compatible version permitted by `package.json`.

For implementation changes:

```sh
npm run typecheck
npm run typecheck:demo
npm run lint
npm run format:check
npm run docs:api:check
npm run test
npm run test:e2e
```

The ordinary browser suite uses deterministic fixtures; it needs no model inference. The configured matrix includes Chromium, Firefox, WebKit, and native Chromium. Use a supported Linux runner when a local browser binary cannot start. A configured project is not evidence that its tests passed.

For a packaging change or a release candidate, build once after the source and documentation are ready:

```sh
npm run build
npm run pack:package
npm run test:package
```

`pack:package` writes `artifacts/webmcp-kit.tgz` and adjacent JSON metadata. The source digest includes package sources, declarations' configuration, package manifests, README, and documentation. Consumer checks reject an artifact whose digest or bytes differ. `test:package` never rebuilds the library; it compiles the isolated consumer's worker from the installed tarball.

The package suite checks distribution contents, strict consumer declarations, core/chat imports without framework peers, SSR imports, one shared registry, and a nested worker on trusted HTTPS. The Pi consumer installs the kit without declaring its internal runtime libraries. The suite also typechecks the shipped [integration example](./examples/counter-assistant.ts). Source aliases are disabled in these consumers.

Run `npm audit` for advisories and `npm audit signatures` for registry verification after dependency changes. These checks answer different questions from runtime tests. The checks workflow validates and tests a tarball before uploading it. The release workflow validates a fresh artifact and publishes those tested bytes. Neither local checks nor a build prove publication or deployment.

`npm run test:lmstudio` is a separate real-model suite. Configure the lab's documented local provider first and run it only when model inference is intended. It does not substitute for deterministic regression coverage. See the [repository lab README](../apps/demo/README.md) for provider configuration and browser commands; repository-only files are not included in the npm tarball.

## Release procedure

The npm version must be new: the release workflow skips a version already present in the registry. Version `0.2.0` introduces the Pi and chat entry points; `0.1.0` does not contain them. Version `0.3.0` renames the planner API to resolver and is a breaking change without compatibility aliases.

1. Finish the review and validation above on the release branch, including the packed consumer tests. Check the manifest and lockfile versions together.
2. Check `npm view @vampaz/webmcp-kit versions --json` and confirm the candidate version is unused. A registry or authentication error does not establish that a version is available.
3. Verify the npm trusted publisher permits publishing from `vampaz/web-mcp`, workflow `release.yml`, on GitHub-hosted runners. The workflow requires `id-token: write`; a local npm login is not used by this release path.
4. After authorization to release, merge the reviewed revision into `master`. The workflow also permits manual runs on `master`, for recovery. Publication runs are not cancelled when another commit arrives.
5. Wait for validation, npm publication, GitHub Packages publication, and GitHub release creation. A partial failure needs inspection before rerunning; a successful npm publication cannot be overwritten.
6. Verify the registry version, provenance, and installed exports. Downstream applications can then replace a temporary Git or tarball dependency with the published version, update their lockfiles, and rerun consumer checks before deployment.

The workflow builds once, tests `artifacts/webmcp-kit.tgz`, and publishes that tarball to both registries. Do not substitute a fresh working-directory pack after the consumer tests. Keep release authorization, CI success, registry publication, and downstream production verification separate.

## Troubleshooting

| Symptom                                      | Inspect and correct                                                                                                                                                        |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unknown planner export such as `ToolPlanner` | The installed release predates `0.3.0`. Upgrade and apply the [0.3.0 migration guide](./migration-0.3.md).                                                                 |
| `/pi` or `/chat` cannot be resolved          | The installed release may predate these exports. Use the reviewed tarball described in the integration guide, or a release that actually contains them.                    |
| Missing Pi runtime dependency                | Upgrade to `0.2.1` or newer and reinstall the kit. npm installs the runtime dependencies automatically. See the dependency model for removing direct `0.2.0` declarations. |
| No tools discovered                          | Check component mounting, `when`, `scope()`, stable names, and duplicate copies of the kit. Use `listTools()` and the integration health report in the page.               |
| Native registration fails but fallback works | Await registration `ready`, inspect `warnings`, and detect the actual browser API. Fallback availability does not prove native registration.                               |
| Worker registration or activation fails      | Check the HTTPS certificate, same origin, non-root scope, base path, compiled asset, MIME type, CSP, and root PWA caching.                                                 |
| Page loads an old worker                     | Recompile the wrapper, verify the deployed asset and registration, then reload. Stop active work before updating a development registration.                               |
| `configuration` or `unsupported`             | Check session fields, limits, browser capabilities, and conversational resolver availability. Handle initialization rejection in the host.                                 |
| `conversation_busy`                          | Another controller/tab owns the operation. Wait for it to finish or stop it through its own UI. Do not automatically steal or retry the action.                            |
| `stale_document`                             | Cancellation or catalog/document change invalidated the request. Rediscover current state for a new user turn.                                                             |
| `transport_failed` after a mutation          | The action may have executed before its reply was lost. Inspect actual app/server state before any new attempt.                                                            |
| `action_denied`                              | The user declined. Leave the turn stopped and allow a new explicit request.                                                                                                |
| `provider_failed`                            | Inspect the endpoint and model response, permissions, truncation, and `singleStep` contract. Do not silently substitute another model.                                     |
| `limit_reached`                              | Reduce context/result size, choose valid bounded limits, or clear history when appropriate. Automatic compaction is disabled.                                              |
| `storage_failed` or missing history          | Check browser storage settings, quota, eviction, account partition, and blocked database operations. Persistence is not guaranteed by the browser.                         |
| Popup is clipped or unavailable              | Verify Popover API support, `ResizeObserver`, and the production CSP. Use the documented CSS variables and test small/zoomed viewports.                                    |
| Stop returns but a server action completed   | Cancellation is cooperative after dispatch. Use application-specific idempotency and state checks; Stop is not rollback.                                                   |

Subscribe to controller snapshots for state and errors. Core events may contain input and output data; redact diagnostics before logging them. Capture the package version/artifact digest, browser features, worker URL/scope, session partition identifiers appropriate for logging, and error code when reporting a failure. Do not include credentials or private conversation contents by default.
