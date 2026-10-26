# Upgrading to 0.3.0

[Documentation index](./README.md) · [API reference](./api-reference.md) · [Operations](./operations.md)

This guide records the 0.2-to-0.3 changes. For the current 0.5.0 API, continue with the [0.4 migration](./migration-0.4.md), then the [0.5 migration](./migration-0.5.md). Some 0.3 APIs below were removed in those releases.

Version `0.3.0` renames the model-provider adapter from _planner_ to _resolver_. The kit never planned anything: a resolver maps one user request onto one concrete tool invocation, and a resolution is that result. Every exported name, option, event, and wire string changed accordingly. There are no compatibility aliases, so `0.2.2` and `0.3.0` cannot be mixed in one application.

Upgrade with `npm install @vampaz/webmcp-kit@^0.3.0` and apply the renames below. Tool definitions, schemas, guards, confirmations, and the invocation pipeline are unchanged.

## Why the rename

The old names described an intention instead of an activity. A planner was expected to produce a multi-step strategy; this kit only ever selected one tool, filled its input, and optionally returned a bounded `tool_sequence`. The new names state what the component does.

## Core API

| `0.2.2`                                  | `0.3.0`                                   |
| ---------------------------------------- | ----------------------------------------- |
| `ToolPlanner`                            | `ToolResolver`                            |
| `ToolPlan`                               | `ToolResolution`                          |
| `ToolPlanStep`                           | `ToolResolutionStep`                      |
| `PlannerContext`                         | `ResolverContext`                         |
| `PlannerAuth`                            | `ResolverAuth`                            |
| `PlannerProviderConfig`                  | `ResolverProviderConfig`                  |
| `PlannerProviderKind`                    | `ResolverProviderKind`                    |
| `PlannerRequest`                         | `ResolverRequest`                         |
| `PlannerRunOptions`                      | `ResolverRunOptions`                      |
| `PlannerOutcomeToolName`                 | `ResolverOutcomeToolName`                 |
| `plannerOutcomeToolNames`                | `resolverOutcomeToolNames`                |
| `isPlannerOutcomeToolName`               | `isResolverOutcomeToolName`               |
| `toolPlanSchema`                         | `toolResolutionSchema`                    |
| `validateToolPlan`                       | `validateToolResolution`                  |
| `createBestPlanner`                      | `createBestResolver`                      |
| `createChromeAIPlanner`                  | `createChromeAIResolver`                  |
| `createConfiguredPlanner`                | `createConfiguredResolver`                |
| `createHeuristicPlanner`                 | `createHeuristicResolver`                 |
| `createRemotePlanner`                    | `createRemoteResolver`                    |
| `createHostedOpenAIPlanner`              | `createHostedOpenAIResolver`              |
| `createHostedOpenAIPlannerOption`        | `createHostedOpenAIResolverOption`        |
| `createBrowserLocalAIPlanner`            | `createBrowserLocalAIResolver`            |
| `HostedOpenAIPlannerOptions`             | `HostedOpenAIResolverOptions`             |
| `HostedOpenAIPlannerOptionConfig`        | `HostedOpenAIResolverOptionConfig`        |
| `WebMCPCommandInputPlannerOption`        | `WebMCPCommandInputResolverOption`        |
| `WebMCPCommandInputPlannerModelOption`   | `WebMCPCommandInputResolverModelOption`   |
| `WebMCPCommandInputPlannerCreateOptions` | `WebMCPCommandInputResolverCreateOptions` |
| `WebMCPCommandPlanEventDetail`           | `WebMCPCommandResolutionEventDetail`      |
| `WebMCPCommandPlannerEventDetail`        | `WebMCPCommandResolverEventDetail`        |

## Options and properties

| `0.2.2`                  | `0.3.0`                   | Applies to                                                                                                                                                   |
| ------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `planner`                | `resolver`                | `initWebMCP`, `createWebMCPKit`, `createPiHarness`, `createPiRuntime`, `getIntegrationHealthReport`, the command input element and its `configure()` options |
| `plannerConfig`          | `resolverConfig`          | kit handle, command input element                                                                                                                            |
| `plannerOptions`         | `resolverOptions`         | command input element and `configure()`                                                                                                                      |
| `initialPlannerOptionId` | `initialResolverOptionId` | command input element and `configure()`                                                                                                                      |
| `createPlanner`          | `createResolver`          | resolver option factory                                                                                                                                      |
| `planner.plan(...)`      | `resolver.resolve(...)`   | `ToolResolver` implementation                                                                                                                                |
| `detail.plan`            | `detail.resolution`       | `webmcp-command-resolution`, `webmcp-command-step`, and `webmcp-command-result` event details                                                                |
| `source: 'planner'`      | `source: 'resolver'`      | tool execution context                                                                                                                                       |

## Testing package

| `0.2.2`                                                                                                                 | `0.3.0`                              |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `runWebMCPPlannerEvalCase`                                                                                              | `runWebMCPResolverEvalCase`          |
| `runWebMCPPlannerEvalSuite`                                                                                             | `runWebMCPResolverEvalSuite`         |
| `runWebMCPPlannerEvals`                                                                                                 | `runWebMCPResolverEvals`             |
| `WebMCPPlannerEvalCase` and its `Base`, `Summary`, `Result`, `StepExpectation`, `SuiteOptions`, and `SuiteResult` types | the same names with `WebMCPResolver` |
| `WebMCPPlannerOutcome`                                                                                                  | `WebMCPResolverOutcome`              |
| `plan` (eval result field)                                                                                              | `resolution`                         |
| `plannerName` (eval suite field)                                                                                        | `resolverName`                       |

## Wire contract

Server implementations and consumers of the command input must change these strings.

| `0.2.2`                  | `0.3.0`                     | Owner                                                   |
| ------------------------ | --------------------------- | ------------------------------------------------------- |
| `/api/webmcp/plan`       | `/api/webmcp/resolve`       | default command input and hosted resolver endpoint path |
| `webmcp_plan`            | `webmcp_resolution`         | OpenAI-compatible JSON schema name                      |
| `hosted-openai-planner`  | `hosted-openai-resolver`    | hosted access `serviceId`                               |
| `plan`                   | `resolve`                   | Pi worker and page RPC method                           |
| `webmcp-command-plan`    | `webmcp-command-resolution` | command input event                                     |
| `webmcp-command-planner` | `webmcp-command-resolver`   | command input event                                     |
| `planning`               | `resolving`                 | command input phase and CSS attribute                   |
| `planner:`               | `resolver:`                 | command input provider option value                     |

The `tool_sequence`, `needs_clarification`, and `no_tools_match` tool names did not change. They describe resolution outcomes, not planning.

## Migration checklist

1. Replace the renamed imports and type names.
2. Replace the `planner` option and property with `resolver`.
3. Rename the `plan` method on a custom resolver to `resolve`.
4. Rename the `plan` field in event detail readers to `resolution`.
5. Rename the `planner` field in eval results to `resolution`, and `plannerName` to `resolverName`.
6. Update listeners for `webmcp-command-resolution` and `webmcp-command-resolver`.
7. Update the server endpoint path, the JSON schema name, and the hosted `serviceId`.
8. Run `npm run test` in the application, then the packed consumer checks described in [operations](./operations.md).

A mechanical find and replace covers most applications. Apply it in this order so the longer names change first:

```sh
plannerOptions      → resolverOptions
initialPlannerOptionId → initialResolverOptionId
createPlanner       → createResolver
plannerConfig       → resolverConfig
planner             → resolver
Planner             → Resolver
ToolPlan            → ToolResolution
ToolPlanner         → ToolResolver
```

Review the result before committing. `plan` is a common word in application code, and only the kit's own identifiers, event payloads, and RPC method changed.
