# Plan: Local Browser AI Provider

## Research Summary

- The demo already supports planner provider selection in `demo/src/components/DemoShell.vue`; `local` currently means deterministic heuristics, not a browser-loaded model.
- Core planner routing lives in `packages/core/src/planner.ts` and `packages/core/src/command-input-options.ts`. Adding a new provider touches public planner config types, command input labels/options, planner creation, and tests.
- The examples in `/Users/carlosrodrigues/works/me` use `@huggingface/transformers` workers with WebGPU:
  - `src/components/LlmChat/LlmChatWorker.js` loads `Xenova/Qwen1.5-0.5B-Chat` through `pipeline('text-generation', ..., { device: 'webgpu', dtype: 'q4' })`.
  - `src/workers/numbersWorker.js` loads `onnx-community/Llama-3.2-1B-Instruct-q4f16` through `AutoTokenizer` and `AutoModelForCausalLM`, warms the model, and runs deterministic generation.
  - `src/utils/model-lease.ts` serializes browser model ownership so multiple local AI features do not compete for GPU memory.
- As of 2026-05-22, `npm view` reports `@huggingface/transformers` latest as `4.2.0` and `@mlc-ai/web-llm` latest as `0.2.83`.
- Hugging Face's Transformers.js v4 release notes say v4 has a rewritten WebGPU runtime, model cache inspection APIs, progress events, and browser/server WebGPU support.
- WebLLM is a better fit for WebMCP planning than Transformers.js because it exposes an OpenAI-compatible chat API and structured JSON generation, which maps directly to the existing planner contract.

## Recommendation

Use `@mlc-ai/web-llm` for the first demo-owned local planner. Do not add a WebLLM provider kind to `@webmcp-kit/core`; the demo should create a `ToolPlanner` and pass it to the command input with `configure({ planner })`.

Default model: `Llama-3.2-1B-Instruct-q4f16_1-MLC`.

Why this default:

- It is in WebLLM's prebuilt model config.
- WebLLM lists it as low-resource, with about 879 MB VRAM required and a 4096 context window.
- It is still small enough for a demo first-run download while being materially more reliable than the tested Qwen 0.5B candidate for tool selection.
- The existing WebMCP planner prompt already compresses the task to a small JSON plan, so structured output matters more than broad reasoning quality.

The earlier Qwen 0.5B candidate loaded successfully, but browser testing showed it was too weak for the planner contract. `Llama-3.2-1B-Instruct-q4f16_1-MLC` also matches the local WebGPU Llama pattern in `/Users/carlosrodrigues/works/me` and produced a valid demo tool plan in browser testing.

Avoid making Transformers.js the first planner provider. It is excellent for the examples repo and useful as a fallback experiment, but for this specific WebMCP planner the absence of native JSON/schema mode means more prompt-and-parse fragility. If we use Transformers.js later, prefer `onnx-community/Qwen2.5-0.5B-Instruct` with `dtype: 'q4'` and `device: 'webgpu'`.

## Sources

- Hugging Face Transformers.js v4 release: https://huggingface.co/blog/transformersjs-v4
- Hugging Face Transformers.js v3 WebGPU and Qwen2.5 example: https://huggingface.co/blog/transformersjs-v3
- WebLLM repository: https://github.com/mlc-ai/web-llm
- WebLLM prebuilt config: https://raw.githubusercontent.com/mlc-ai/web-llm/main/src/config.ts
- MLC Qwen2.5 0.5B model card: https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC
- Chrome built-in AI setup and hardware notes: https://developer.chrome.com/docs/ai/get-started

## Assumptions

- This is demo-only initially; no package API guarantee until the provider proves useful.
- First-run download cost is acceptable if the UI is honest about loading progress and WebGPU requirements.
- We should not replace Chrome built-in AI. This provider is for browsers where the app wants to load its own local model.
- We should not overload provider `local`, because that currently means deterministic, always-available local planning.

## Implementation Checklist

- [x] Phase 1: Keep core provider-agnostic
  - [x] Step 1.1: Leave `@webmcp-kit/core` provider types, command input provider options, and planner factory unchanged
    - Files: `packages/core/src/interfaces/tool.ts`, `packages/core/src/command-input-options.ts`, `packages/core/src/planner.ts`
    - Test: `npm run test -- packages/core/src/planner.spec.ts`

- [x] Phase 2: Add a demo-owned WebLLM planner
  - [x] Step 2.1: Add WebLLM only to the demo package
    - Files: `demo/package.json`, `package-lock.json`
    - Test: `npm --workspace @webmcp-kit/demo run test -- src/utils/browser-local-ai-planner.spec.ts`
  - [x] Step 2.2: Implement the local model planner as a demo utility that satisfies `ToolPlanner`
    - Files: `demo/src/utils/browser-local-ai-planner.ts`, `demo/src/interfaces/browser-local-ai.ts`
    - Test: `npm --workspace @webmcp-kit/demo run test -- src/utils/browser-local-ai-planner.spec.ts`
  - [x] Step 2.3: Pass the demo-owned planner directly to the WebMCP command input
    - Files: `demo/src/components/DemoShell.vue`
    - Test: `npm --workspace @webmcp-kit/demo run test -- src/components/DemoPages.spec.ts`

- [x] Phase 3: Verification and docs
  - [x] Step 3.1: Document provider tradeoffs and browser requirements
    - Files: `docs/planner-providers.md`, `docs/browser-support.md`
    - Test: `npm --workspace @webmcp-kit/demo run test -- src/utils/browser-local-ai-planner.spec.ts`
  - [x] Step 3.2: Run typecheck after dependency and type changes
    - Files: `demo/package.json`, `package-lock.json`
    - Test: `npm exec tsc -- --noEmit`

## Open Questions Before Implementation

- Should the dependency live in `@webmcp-kit/core` or only in `@webmcp-kit/demo` with a custom `ToolPlanner` passed into the command input? Resolved: demo-only.
- Should the provider be called `WebLLM`, `Browser local AI`, or `Local model` in UI? Resolved: `Browser local AI`.
- Do we want a model lease helper in this repo now, or wait until there are multiple local model features? Resolved: not yet; only one local model feature exists.
