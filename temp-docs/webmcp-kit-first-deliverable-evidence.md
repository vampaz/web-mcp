# First deliverable implementation evidence

Date: 2026-10-17. Scope: Phases 1–5 of the implementation plan. Extension, account service, external provider login, publication, deployment, and standalone demo adoption remain later work.

The recorded implementation used `master`, based on `0f0bd3c56ff58c98a2459f98bc23eb8229c52715`, with unstaged and uncommitted changes. The sibling demo was read only; no sibling files were changed.

This file records completed checks at specific revisions. Test counts and artifact digests below describe those revisions, not every later edit. Verify the current artifact's source digest and bytes before reusing it. Current integration instructions live in the [developer documentation](../docs/README.md).

## Recorded revision: dependency remediation and developer documentation

The renewed review fixed all seven vulnerable dependency entries. NCU updated Vitest to 5.0.5 and oxfmt to 0.73.0. The lockfile now resolves @vitest/mocker 5.0.5, tinypool 2.2.0, brace-expansion 2.1.7, devalue 5.9.4, and undici 7.30.1. No dependency overrides were added. The root and consumer-fixture audits report zero vulnerabilities. Registry verification passed for 294 signatures and 104 attestations.

Three additional runtime defects were reproduced and repaired: an already-aborted RPC could still execute, Chrome AI inference did not receive cancellation, and a late heartbeat failure could interrupt a newer turn. Regression tests failed before the corresponding fixes and passed afterward. The earlier full-review repairs remain included.

Developer documentation now includes an integration walkthrough, architecture/turn/state/deployment diagrams, operational and security guidance, framework lifecycle examples, the server resolver wire protocol, and a generated reference for all 12 public entry points and 177 distinct public symbols. Documentation review corrected an HTTP model-origin example, non-reactive route examples, incomplete submission/approval guidance, stale roadmap claims, and missing API/error details. The executable counter-assistant example has cancellation and initialization-cleanup regression coverage and passes a strict typecheck against the installed tarball.

Completed validation for this revision:

- 321 unit/integration tests in 48 files passed on Vitest 5.0.5.
- Library and demo typechecks, lint, formatting, and diff whitespace checks passed.
- 45 macOS browser tests passed over trusted HTTPS in Chromium, WebKit, and native Chromium, with no retries.
- 64 Linux browser tests passed over trusted HTTPS in Chromium, Firefox, WebKit, and native Chromium, with no retries. These runs cover the final production runtime; subsequent edits added documentation and documentation checks.
- The generated API reference matches on macOS and Linux. Both CI workflows now check it for drift.
- All 315 local documentation links/anchors and seven JSON examples passed validation. All five Mermaid diagrams rendered in the integrated browser over the TLS plugin's advertised HTTPS domain.
- One final authorized library build and pack passed. All four isolated package-consumer checks passed, including the shipped documentation example, strict declarations, SSR imports, core/chat without Pi peers, and the compiled nested worker over trusted HTTPS.

The final revision passed three distinct review passes with no actionable findings: scope/diff and documentation completeness; source contracts, cancellation, ownership, and adversarial behavior; then completed checks, rendered diagrams, and the installed package. All discovered issues were fixed before this clean cycle. Real-model inference was not rerun in this revision; earlier model results below are historical.

Current unpublished artifact: `artifacts/webmcp-kit.tgz`.

- Source digest: `d149d6e148c8d5228dfb90217d29a3d12626e11273093c1e0ef7987178de6e73`
- Tarball SHA-256: `61d39a6cfb04aa7fed30565f20f913c8ceb2366521b55696e365423a3759d667`

The changes remain local, unstaged, and uncommitted. No CI workflow, publication, deployment, external reviewer, or model invocation was triggered. Temporary review tabs and servers were closed; the shared TLS service was preserved.

## Earlier revision: full local review and fixes

The review covered the tracked diff, untracked implementation, connected callers, tests, documentation, and package workflows. It found and fixed premature whole-turn RPC deadlines, missing runtime cancellation, undercounted serialized resolver requests, queued approval-dialog close events, and permanent teardown when a page enters the back/forward cache. Regression coverage includes elapsed-time simulation, transport cancellation, exact UTF-8 body limits, concurrent approvals, and cached-page lifecycle events.

The package-consumer browser fixture now uses the TLS plugin's HTTPS URL. Repository guidance requires that domain for development browser checks and fixtures. The temporary HTTP review fixture was stopped.

Completed validation for these fixes:

- 313 unit/integration tests in 47 files passed.
- Library and demo typechecks, lint, formatting, and diff whitespace checks passed.
- 45 deterministic browser tests passed over trusted HTTPS in Chromium, WebKit, and native Chromium. An initial run stopped before browser tests because TLS daemon negotiation timed out; the daemon subsequently reported healthy, and the unchanged rerun passed.
- The integrated browser verified application approval, a new fixture chat turn, and conversation preservation when switching to popup mode. Screenshot: ignored `test-results/review-https-popup.png`.
- The authorized library build and unpublished pack passed. All 4 isolated package-consumer tests passed against the fresh artifact, including public declarations, SSR imports, the compiled nested worker, and trusted HTTPS browser fixtures.

The final revision passed the three review passes: scope and diff integrity, correctness and adversarial behavior, and validation including rendered browser behavior and the packaged consumer. No actionable findings remain from this review. The package build did not change reviewed source files.

Current unpublished artifact: `artifacts/webmcp-kit.tgz`.

- Source digest: `20b437f36aec0d5f5d751936c5764b01b07446b3f1bec85b7995e65a4f6ac9ee`
- Tarball SHA-256: `f4251764a708c4341945812be6dde202048048bdab9fe0c4f30d426c1c69a6e6`

Firefox and real-model inference were not rerun for this revision. Earlier Linux and model results below remain historical evidence. The dependency audit still reports seven pre-existing findings; the affected installed versions also occur in the original lockfile.

## Earlier revision: popup, TLS, and UI follow-up

The current lab is [https://webmcp-kit.localtest.me](https://webmcp-kit.localtest.me). It remains Vite + Vue. The generic Assistant uses the same independent `/chat` component in both presentations. `mode: 'inline'` is the default; `mode: 'popup'` adds a draggable launcher and panel, pointer/keyboard resizing, close/reopen, viewport bounds, zoom handling, and focus return. Changing modes keeps the controller, conversation, and draft. Popup mode uses the native Popover API to avoid ancestor clipping. Escape preserves IME composition.

The reusable chat and local lab have a revised visual design: neutral typography and colors, compact SVG controls, a bordered composer, clearer messages, a two-column workspace, and a readable application approval dialog. The lab no longer supplies a page-specific chat title. Provider settings remain outside the component.

`@vampaz/vite-plugin-local-tls` 0.2.0 supplies trusted HTTPS and WSS HMR. The interactive lab uses Vite upstream port 4173. Automated tests use `https://webmcp-kit-tests.localtest.me` and port 4174, preserving the interactive page and its history. Packed consumers use a separate HTTPS hostname. Certificate verification remains enabled. The existing shared macOS service and trusted CA were reused; no trust bypass or replacement was performed. The published MIT artifact and npm integrity were checked. It adds no runtime dependencies.

Completed checks for that revision:

- `npm run test`: 304 tests across 46 files passed.
- Typechecks, lint, formatting, and `git diff --check`: passed.
- Linux: all 58 browser cases passed across Chromium, Firefox, WebKit, and native Chromium, with no retries. This includes trusted HTTPS/WSS, popup pointer movement and resizing, keyboard controls, clipping, 200% zoom, narrow/short layouts, reconnect, approvals, and preserved drafts/history.
- macOS: all 41 browser cases passed in Chromium, WebKit, and native Chromium. The full portable/native matrix, including Firefox, is the Linux result above.
- `npm run test:lmstudio`: all 5 real-model cases passed with the selected Gemma model and fixtures disabled. The confirmed result-dependent write/re-resolve/reload case now uses popup mode. Cancellation asserts the interrupted state and absence of a resumed inference request.
- Fresh authorized library build and unpublished pack: passed. All 4 isolated consumer checks passed on both macOS and Linux. The consumer tests both inline and popup mode with a compiled nested worker, one registry, and trusted HTTPS. It waits for the TLS route before browser navigation, including a cold proxy start.
- npm verification: 302 registry signatures and 106 attestations passed. The audit still reports the same 7 pre-existing findings; the TLS package has no reported advisory in this audit.

Review repairs included zoom overflow, a consistent custom resize grip across browser engines, explicit Firefox test CA policy, hidden-control assertions in the model cancellation test, and bounded filesystem cleanup for Vite's late optimizer writes. A final runtime repair registers the active turn before notifying subscribers. Three regression cases reproduced nested send, clear, and Stop races before the fix and passed afterward. Linux CI uses an ephemeral TLS proxy and exact generated CA trust in OS/NSS/Firefox stores. It installs no startup service and stops the proxy after browser checks.

The final in-app check read the live value, approved a write to 7, and read 7 back through the real model. Switching between inline and popup preserved the conversation. Keyboard popup movement also worked. Screenshots are saved under ignored `test-results/chat-inline-final.png` and `test-results/chat-popup-final.png`.

Unpublished artifact for that revision: `artifacts/webmcp-kit.tgz` (approximately 208 KiB).

- Source digest: `2af835c4bfad760e7b765ac6049a180d7d3dd4584221f6ac47b6f3af20814539`
- Tarball SHA-256: `cdb38ac222804d4f62219e4cf15c202d5d73c48d4d6a5d433b6e50efc615e0b0`

The following sections retain earlier implementation history. Their pending-gate and artifact statements apply to those earlier revisions. No publication, deployment, commit, push, extension work, or sibling demo refactor is part of this follow-up.

## Earlier review fixes, 2026-10-17

The follow-up review fixed persistent interruption state, tool refresh after completed actions, rejected draft retention, focus preservation, compact chat height, and the Vite worker setup guide. Tool refresh failures preserve known action results. Catalog changes during resolution still reject stale actions. Framework examples now show initialization errors and retain teardown handling.

- `npm run test`: 293 tests across 46 files passed, including the actual Pi Durable loop.
- `npm run typecheck`, `npm run typecheck:demo`, `npm run lint`, and `npm run format:check`: passed.
- Chromium, WebKit, and native Chromium: 29 browser cases passed with no retries. The run used a temporary Playwright configuration on port 4174 to preserve the existing development server on port 4173.
- In-app browser: a `24rem` panel measured exactly 384px, with no outer overflow when its controls fit. A rejecting test controller preserved the draft and composer focus. Screenshot: ignored `test-results/chat-review-fixes.png`. The temporary tab was closed; no model request was made.
- `npm run test:package -- tests/package/worker-assets.spec.ts`: stopped at the stale-artifact guard. The tarball listed below predates these fixes. Package verification requires a fresh authorized build and pack; it has not passed for this revision.

The source changes and guide are implemented. The final completion gate remains pending package verification. Firefox and real-model inference were not rerun for these fixes. Results in the following sections describe the earlier implementation revision, not this follow-up.

## Runnable setup

Run `npm ci --ignore-scripts`, configure `apps/demo/.env.local` from its example, and run `npm run dev:demo`. Open `https://webmcp-kit.localtest.me/` and select Core, Harness, or Chat. The lab uses Vue 3 and Vite. The local configuration selects `google/gemma-4-26b-a4b`; its LM Studio server remains on loopback. The source lab needs no library build or sibling checkout.

The local library build and unpublished packaging checks were explicitly approved in the chat. `npm run test:package` consumes an existing artifact without rebuilding the library. It builds the isolated worker fixture. Future CI checks build, pack, and test before publication.

## Initial implementation validation

| Check                            | Completed result                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| `npm run test`                   | 283 tests across 46 files passed; actual Pi Durable loop included.                            |
| `npm run typecheck`              | Passed.                                                                                       |
| `npm run typecheck:demo`         | Passed.                                                                                       |
| `npm run lint`                   | Passed without warnings.                                                                      |
| `npm run format:check`           | Passed.                                                                                       |
| `npm run build`                  | Passed; public JavaScript entries and declarations emitted.                                   |
| `npm run pack:package`           | Passed; unpublished tarball, source digest, and SHA-256 metadata created.                     |
| `npm run test:package`           | All 4 checks passed: tarball contents, core-only, chat-only, Vite + Vue with compiled worker. |
| `npm run test:e2e` in Linux      | All 34 cases passed with no retries across Chromium, Firefox, WebKit, and native Chromium.    |
| `npm run test:lmstudio` on macOS | All 5 real-model cases passed with no retries.                                                |

The package fixtures install the tarball in temporary directories without source aliases. Core and chat work without Pi or framework peers. Public declarations pass strict consumer checks. The isolated Vite + Vue fixture typechecks its single-file component, compiles its own worker, runs it under `/nested/webmcp-pi/`, and confirms one page registry. The user requested Vite + Vue during implementation; the earlier Astro fixture was removed. Core/chat Node imports retain separate SSR checks.

Deterministic browser tests cover input validation, approval and denial, result feedback, stop, navigation/reload without replay, worker termination, idle reconnection, PWA coexistence, commit-before-display, owner partitions, lock contention, actual storage eviction, storage errors, request limits, keyboard input, text-only rendering, long output, scroll retention, narrow layout, zoom, and multiple chat views. Native Chromium uses the actual browser API for discovery, invocation, and cancellation. Mocked native tests remain separate unit evidence.

## Browser environments

Playwright 1.64.1 supplies Chromium 156.0.8078.4, Firefox 157.0, and WebKit 27.2. The full matrix ran in the official `mcr.microsoft.com/playwright:v1.64.1-noble` image, digest `sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf`. The Linux source snapshot excluded local credentials and host dependencies. The result is copied to ignored `test-results/linux-browser-results.json`.

The macOS 27.0.1 Firefox executable fails at browser startup, before any application request. Linux Firefox passed all nine portable cases. Local Chromium/WebKit/native checks and package consumers also passed. This host limitation is documented in the lab instructions; configured browser projects alone are not treated as evidence.

Final manual inspection uses the in-app browser. Real model read, app-owned approval, confirmed write to 7, and result-based read worked through the Vue lab. Narrow layout, zoom, keyboard focus, scroll retention, and text-only rendering passed the automated browser matrix. The final in-app screenshot is saved under ignored `test-results/demo-vue-iab.png`. The external manual browser tab was closed. Automated browser tests run headlessly and close their own processes. An older development worker retained the earlier module graph; reinstalling only the lab worker restored the current protocol. The development instructions document that refresh.

## Real local model

| Setting                | Verified value                                 |
| ---------------------- | ---------------------------------------------- |
| LM Studio              | 0.4.26+4                                       |
| Model                  | `google/gemma-4-26b-a4b`                       |
| Runtime / quantization | MLX, 4-bit                                     |
| Loaded context         | 32,768 tokens                                  |
| Resolver output        | JSON schema, 1,024 maximum output tokens       |
| Generation             | Temperature 0.2; reasoning explicitly disabled |

The five completed cases cover tool discovery and an answer; read, confirmed result-dependent write, re-resolve and reload; denied write with no follow-up round; cancellation of actual inference without resume; and headless use with no chat import. No hosted provider, paid credit, fixture replacement, or test retry was used in this lane. Preflight metadata and results remain under ignored `test-results/`.

The conversational adapter explicitly requests a single next action. Core's bounded Resolver mode retains its sequence contract. Provider failure, invalid output, denial, storage limits, and unknown action outcomes remain visible instead of triggering fallback or automatic retries.

## Unpublished package

Artifact: `artifacts/webmcp-kit.tgz` (approximately 189 KiB), with adjacent `artifacts/webmcp-kit.json` metadata.

- Source digest: `0dd498821a698d8e49a729ee2ac408b418e99eec0ec1da9ddcc824a9610ab107`
- Tarball SHA-256: `ffb529479be1f523a0e9d3947a6143fa1917c7682b2a1f6c7a84e397f8297dcd`

The build stamp, current source digest, metadata, and tarball bytes are checked before consumer installation. The tarball excludes apps, credentials, development fixtures, tests, and resolutions. The release workflow publishes this tested tarball rather than rebuilding different content after validation. No workflow was triggered during this task.

New optional runtime peers are Pi Durable, Pi AI, and Chord 1.3.0. Test-only additions include Playwright 1.64.1 and fake-indexeddb 6.2.6. Development tooling uses @vitejs/plugin-vue 6.0.10 and vue-tsc 3.3.13; their upstream artifacts, integrity, and MIT licenses were checked. Vue is 3.5.44. npm signature verification passed for 301 signatures and 105 attestations. The final audit reports 7 pre-existing findings; affected dependency versions were compared with the original lockfile. No unrelated dependency upgrades were made.

The mandatory final review covers scope/diff integrity, adversarial behavior, and completed runtime evidence. Its outcome is reported in the final task response after inspecting this final revision.
