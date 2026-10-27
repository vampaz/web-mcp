# Local package lab

The lab is a small Vue 3 application served by Vite. Run all examples from this repository.

```sh
npm ci --ignore-scripts
npm run dev:demo
```

Open [https://webmcp-kit.localtest.me](https://webmcp-kit.localtest.me). The lab starts in Chat, with navigation ordered Chat, Harness, Core, Toolkit. Chat configures the reusable custom element against the harness. Its Presentation selector switches between inline and draggable popup modes without resetting the conversation. Open `/?mode=chat&presentation=popup` to start with the launcher. Harness runs the real Pi loop with plain controls. Core reads and writes an application counter through shared validation and confirmation. Toolkit registers a `defineZodTool` tool through the Vue `useWebMCPTool` helper, a `registerFormTool` form, and an offline `<webmcp-command-input>` that uses the local resolver. In development, it also loads the devtools overlay on demand. Source aliases resolve exact package entries to one page registry; the development server does not build the library.

The Vite server uses [`@vampaz/vite-plugin-local-tls`](https://github.com/vampaz/vite-plugin-local-tls) 0.2.0. TLS terminates at its shared, loopback-only service. Vite's internal upstream binds `127.0.0.1:4173`; use the HTTPS hostname in the browser. The plugin prints that URL at startup and provides WSS HMR. Run `npm exec -- vite-local-tls doctor` to check CA trust and service health. First-time trust/service installation follows the plugin's operating-system authorization flow. Certificate verification stays enabled.

## LM Studio

Start the local LM Studio server, then open the **Settings** icon inside chat. Select **LM Studio (local)** and choose a downloaded chat model, or select **Chrome built-in AI** in a supported browser. The model list excludes embeddings and places loaded models first. LM Studio may load the selected model on the first message; the demo does not download models. Provider failures remain visible in settings, where you can select another provider.

Copy `.env.example` to `.env.local` to change the loopback server URL, provide an optional server-only `LM_STUDIO_API_TOKEN`, or set `LM_STUDIO_MODEL` as the initial model preference. The selection is remembered across Chat and Harness in this browser. The example requests JSON-schema output, disables reasoning explicitly, uses temperature 0.2, and caps each response at 1,024 tokens.

To inspect automated tests without a model, run `npm run dev:demo:fixtures` and open `https://webmcp-kit-tests.localtest.me`. This separate server offers **Test responses (no AI)** and storage fixtures. Both test flags are required; the ordinary demo never exposes this provider or silently falls back to it. Test and real conversations use separate storage namespaces. Existing experimental history is retained in its old namespace and is not loaded into real conversations.

The server binds loopback and proxies only GET `/__lmstudio/v1/models`, GET `/__lmstudio/api/v0/models`, and POST `/__lmstudio/v1/chat/completions`. It checks origins, methods, host, body size, and that the selected model is in LM Studio's chat-model list; redirects and arbitrary targets are rejected. Account credentials are never sent to LM Studio. The app owns provider selection and connection; the reusable chat only renders the supplied settings.

```sh
npm run test
npm run typecheck
npm run typecheck:demo
npm run lint
npm exec playwright -- install chromium firefox webkit
npm run test:e2e
npm run test:lmstudio
```

Automated tests use `https://webmcp-kit-tests.localtest.me` on a separate Vite upstream port, 4174, so they do not replace the interactive lab or its browser history. Ordinary browser tests start an explicit fixture server and exercise the actual Pi runtime with deterministic resolver responses. `test:lmstudio` starts a separate server with fixtures disabled. Its preflight requires the selected model to be loaded and checks structured output. Missing server/model or a failed case fails the suite. There are no test retries or substitutions. Results and model metadata are saved under ignored `test-results/`.

On the tested macOS 27.0.1 host, the bundled Firefox executable fails before loading the application. Chromium, WebKit, and native Chromium can run locally with `npm run test:e2e -- --project=chromium --project=webkit --project=native-chromium`. The complete matrix uses the official Playwright 1.64.1 Linux container. Disposable Linux CI installs the generated test CA into the OS, Chromium NSS, and Firefox policy stores. It starts an ephemeral TLS proxy and stops it after testing; it does not install a startup service. Node test readiness checks include the OS trust store.

The model suite covers tool discovery, answer, read, confirmed write, result-dependent re-resolving, denial, cancellation, and reload without replay. The browser suite also covers storage partitions, writer contention, page interruption, multiple chat views, keyboard input, text-only rendering, narrow layouts, zoom, popup dragging/resizing, switching presentations, trusted HTTPS/WSS, and native-disabled use. A separate native Chromium project requires the actual browser API and fails if it is unavailable.

## Packed consumers

The checks workflow builds and packs an unpublished artifact, then runs `npm run test:package` before publication. Download its `artifacts/webmcp-kit.tgz` and matching `.json` metadata to run the same checks locally. `WEBMCP_PACKAGE_TARBALL` can point to another `.tgz` with adjacent metadata. The test rejects stale sources and mismatched bytes. It never silently builds the library.

Package fixtures install the tarball in isolated temporary directories, with source aliases disabled. They check core and chat without framework peers, declarations, a Vite + Vue consumer without explicit Pi dependencies, an in-page controller under `/nested/`, inline/popup chat over trusted HTTPS, and one page registry. Applications, local credentials, fixtures, and resolutions are excluded from the tarball. Root repository rules govern any explicitly requested local packaging build.

Storage fixtures are available only on the explicit test server. The local lab uses its own IndexedDB namespace.
