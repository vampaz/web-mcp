# Local package lab

The lab is a small Vue 3 application served by Vite. Run all examples from this repository. The existing sibling demo is not required and remains unchanged.

```sh
npm ci --ignore-scripts
npm run dev:demo
```

Open [https://webmcp-kit.localtest.me](https://webmcp-kit.localtest.me). The lab starts in Chat, with navigation ordered Chat, Harness, Core. Chat configures the reusable custom element against the harness. Its Presentation selector switches between inline and draggable popup modes without resetting the conversation. Open `/?mode=chat&presentation=popup` to start with the launcher. Harness runs the real Pi loop with plain controls. Core reads and writes an application counter through shared validation and confirmation. Source aliases resolve exact package entries to one page registry; the development server does not build the library.

The Vite server uses [`@vampaz/vite-plugin-local-tls`](https://github.com/vampaz/vite-plugin-local-tls) 0.2.0. TLS terminates at its shared, loopback-only service. Vite's internal upstream binds `127.0.0.1:4173`; use the HTTPS hostname in the browser. The plugin prints that URL at startup and provides WSS HMR. Run `npm exec -- vite-local-tls doctor` to check CA trust and service health. First-time trust/service installation follows the plugin's operating-system authorization flow. Certificate verification stays enabled.

## LM Studio

Copy `.env.example` to `.env.local` in this directory. Set `LM_STUDIO_MODEL` to the exact model ID you choose. Start the local LM Studio server and load that model. No model is downloaded or selected automatically. The example requests JSON-schema output, disables reasoning explicitly, uses temperature 0.2, and caps each response at 1,024 tokens. `LM_STUDIO_API_TOKEN` is optional and stays in the Vite server.

The server binds loopback and proxies only GET `/__lmstudio/v1/models` and POST `/__lmstudio/v1/chat/completions`. It checks origins, methods, host, body size, and the configured model; redirects and arbitrary targets are rejected. Account credentials are never sent to LM Studio. Provider configuration remains outside the reusable chat.

```sh
npm run test
npm run typecheck
npm run typecheck:demo
npm run lint
npm exec playwright -- install chromium firefox webkit
npm run test:e2e
npm run test:lmstudio
```

Automated tests use `https://webmcp-kit-tests.localtest.me` on a separate Vite upstream port, 4174, so they do not replace the interactive lab or its browser history. Ordinary browser tests start an explicit fixture server and exercise the actual Pi runtime with deterministic planner responses. `test:lmstudio` starts a separate server with fixtures disabled. Its preflight requires the selected model to be loaded and checks structured output. Missing server/model or a failed case fails the suite. There are no test retries or substitutions. Results and model metadata are saved under ignored `test-results/`.

On the tested macOS 27.0.1 host, the bundled Firefox executable fails before loading the application. Chromium, WebKit, and native Chromium can run locally with `npm run test:e2e -- --project=chromium --project=webkit --project=native-chromium`. The complete matrix uses the official Playwright 1.64.1 Linux container. Disposable Linux CI installs the generated test CA into the OS, Chromium NSS, and Firefox policy stores. It starts an ephemeral TLS proxy and stops it after testing; it does not install a startup service. Node test readiness checks include the OS trust store.

The model suite covers tool discovery, answer, read, confirmed write, result-dependent replanning, denial, cancellation, and reload without replay. The browser suite also covers storage partitions, writer contention, worker termination, multiple chat views, keyboard input, text-only rendering, narrow layouts, zoom, popup dragging/resizing, switching presentations, trusted HTTPS/WSS, and native-disabled use. A separate native Chromium project requires the actual browser API and fails if it is unavailable.

## Packed consumers

The checks workflow builds and packs an unpublished artifact, then runs `npm run test:package` before publication. Download its `artifacts/webmcp-kit.tgz` and matching `.json` metadata to run the same checks locally. `WEBMCP_PACKAGE_TARBALL` can point to another `.tgz` with adjacent metadata. The test rejects stale sources and mismatched bytes. It never silently builds the library.

Package fixtures install the tarball in isolated temporary directories, with source aliases disabled. They check core and chat without framework peers, declarations, a Vite + Vue consumer without explicit Pi dependencies, an application-compiled worker under `/nested/`, inline/popup chat over trusted HTTPS, and one page registry. Applications, local credentials, fixtures, and plans are excluded from the tarball. Root repository rules govern any explicitly requested local packaging build.

Storage fixtures are available only on the explicit test server. The local lab uses its own IndexedDB namespace and does not touch the standalone demo's history.

After changing worker dependencies during source development, unregister the lab's `/webmcp-pi/` service worker in browser developer tools and reload. This refreshes the development worker's cached module graph. Preserve the host application's root PWA registration.
