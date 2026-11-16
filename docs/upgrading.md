# Upgrading from 0.5 through 0.10

[Documentation index](./README.md) · [Changelog](../CHANGELOG.md) · [API reference](./api-reference.md)

This guide covers consumer-visible behavior from 0.5.0 through 0.10.0. Read the linked migration and API guides for the full contracts. For releases after 0.10.0, use the [changelog](../CHANGELOG.md) as the source of truth.

## 0.5 baseline

0.5.0 was a breaking release. If you are upgrading from 0.4, apply the [0.5 migration guide](./migration-0.5.md) first. The changes that remain relevant to later upgrades include:

- Node 24 or newer is required.
- `invokeTool()` has no `confirmed` bypass. Approvals must resolve to an explicit `true`.
- Input must be plain JSON. Invalid input returns `invalid_input` instead of rejecting.
- Native and resolver paths share stricter schema validation and error results.
- Pi exposes structured tool messages, activity, usage, refresh, and account conversation helpers.
- Chat uses `controller` instead of `harness`, and adds labels, themes, slots, parts, and `renderMessage`.

## 0.5.1

0.5.1 restores immediate New chat when the chat's plus button is clicked, without a confirmation step. If clearing fails, the existing history and draft are preserved. Applications upgrading from 0.5.0 should not expect or add a confirmation prompt for New chat, and should retain the failed-clear behavior.

## 0.6

0.6.0 adds an optional chat settings module. Pass `settings` to `<webmcp-chat>` to show provider/model controls, application-owned approval preferences, status/error feedback, and a diagnostics slot. Conversation state and keyboard focus are preserved while switching views.

0.6.1 deprecates the `settingsIntro` label and uses the shared **Settings** labels. Removing that label in a later release is safe only after your custom labels no longer depend on it.

0.6.2 changes chat layout and accessibility. Suggested prompts sit outside the nested message log, and `::part(transcript)` exposes a region. Update selectors or styles that assumed the previous structure.

## 0.7

0.7.0 preserves tool annotations and output schemas through native, direct-provider, and hosted resolver paths. Changing tool metadata can still change resolver choices, so review model behavior after upgrading.

`listLmStudioModels()` is now available for applications that build their own LM Studio model settings. Pi also stops unchanged read loops with one bounded correction.

## 0.8

0.8.0 changes native failure handling. Native WebMCP application failures return a structured error envelope instead of rejecting the native callback. Native callers must check `isError` before treating a result as success. Add `ToolExecutionError` when an application needs stable error codes and JSON-safe partial details; the native output schema accepts either the successful output or the error envelope.

0.8.2 bases Pi history compaction on the selected model's context and output limits. Unknown model capacity no longer triggers a speculative summary. Custom resolvers can expose `getModelLimits()`.

0.8.1 adds LM Studio recovery guidance; 0.8.3 changes internal lifecycle machines without changing public exports; 0.8.4 adds the `composer-meta` slot; 0.8.5 adjusts chat settings chevrons.

## 0.9

0.9.0 adds the opt-in `/page-bridge` entry. Install it only when a same-window script needs fallback-registry discovery and invocation. It is not an authentication or origin-trust boundary; see the [page bridge guide](./page-bridge.md).

Chat changes in 0.9.0 are visible to hosts and users:

- User messages are bubbles; assistant replies are plain text with a Copy button. Consecutive tool calls form a “Used N tools” block.
- Stop replaces Send while a turn runs, and provider errors replace the composer hint.
- Provider and model selection moves from settings selects to a composer model picker. Settings open as a full view with a back button.
- `WebMCPChatSettings` providers accept `description`, `detail`, `badge`, and `icon`; models accept `detail` and `badge`.
- `onChange` reports the selected model across providers.
- New slots, parts, and CSS properties include `identity`, `before-composer`, `model-button`, `model-picker`, `--webmcp-chat-surface`, `--webmcp-chat-line-strong`, `--webmcp-chat-success`, `--webmcp-chat-warning`, and `--webmcp-chat-mono`.
- The `conversationModel` and `provider` labels are unused.

0.9.1 makes guarded calls fail closed when a guard does not approve. Invocation outcomes carry the invocation ID, including pre-execution outcomes. Vue watched tool sets re-sync and retire stale registrations; React preserves the guard receiver and also fails closed.

## 0.10

0.10.0 adds the `/assistant`, `/server`, `/chat/markdown`, and CDN script-tag integrations. Existing entry points keep their exports. Review these consumer-visible changes before upgrading:

- `scope()` now fails closed. A scope that returns `undefined`, `null`, or an object without a boolean `available` marks the tool unavailable and returns `scope_failed`. Tools without `scope` stay available. Fix any scope that relied on a nullish result meaning available.
- The inline chat now defaults to a stable block size at its previous minimum instead of growing with the conversation. A host `block-size` still wins; set one when the panel should fill its container.
- Confirmation handlers receive `callerRequired`. It is true when the caller added the requirement, such as Pi's untrusted-content rule. A source-scoped preference can use it to preserve the approval; the handler still decides. Do not skip a caller-required prompt just because the chat preference is off.
- The new `/server` entry rejects `pattern` in caller-supplied tool `inputSchema`, including nested positions, with an explicit `400` before authorization or any upstream request. Keep pattern validation in the authoritative tool definition at invocation and send a pattern-free schema to the server resolver. This policy applies to the server entry; browser and core schemas keep their existing `pattern` support.
- Chat hides “Try again” after an action completes or fails, and shows a declined action with neutral text. Update UI tests that expected a retry after a mutating call.

See the [server resolver provider contract](./resolver-providers.md), [chat guide](./chat.md), and [integration guide](./integration.md) for the new entries.

## Upgrade checklist

1. Run Node 24 or newer and reinstall the dependency lockfile.
2. Update native result handling to check `isError`.
3. Review approval handlers for `true`-only decisions and JSON-safe input.
4. Review chat selectors, labels, settings, slots, and model-picker callbacks.
5. Check tool schemas for the stricter 0.5 keyword and format rules.
6. Handle Pi error codes and `reason` values instead of parsing prose.
7. Test route/component teardown, cancellation, history reload, and narrow chat layouts.
