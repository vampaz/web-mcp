# Architecture

[Documentation index](./README.md) · [Integration](./integration.md) · [API reference](./api-reference.md)

## Components and ownership

The application owns tools, state, authorization, approvals, model configuration, and lifecycle. The kit supplies registration, validation, transport, persistence, and optional interfaces. A planner proposes an action; only application code executes it.

```mermaid
flowchart TB
  User[User]
  UI[Optional chat or application UI]
  Page[Page controller and tool host]
  Worker[Dedicated Pi service worker]
  Storage[(IndexedDB conversation log)]
  Lock[Web Lock for the conversation]
  Planner[Application-configured planner]
  Model[Browser AI or application model endpoint]
  Registry[Core registry and invocation pipeline]
  App[Application state and authenticated services]
  Native[Native WebMCP, command input, devtools, test bridge]
  User --> UI
  UI --> Page
  Page <-->|Bound MessageChannel and worker messages| Worker
  Worker --> Lock
  Worker --> Storage
  Worker -->|Plan one next action| Page
  Page --> Planner
  Planner --> Model
  Worker -->|Invoke one action| Page
  Page --> Registry
  Native --> Registry
  Registry -->|Validate, approve, guard, execute| App
```

| Surface           | Responsibility                                                                                    | Starts work on import?                                     |
| ----------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Core              | Definitions, registry, native adapter, invocation, planners, command input, diagnostics           | No automatic tool registration or inference                |
| `/pi`             | `createPiHarness`, current-context `createPiRuntime`, registry tool host, public controller types | No worker, storage, or model request                       |
| `/pi/worker`      | Installs the worker message protocol and persistent runtime                                       | Only after `installPiServiceWorker()`                      |
| `/chat`           | Text-only transcript and controls bound to a supplied controller                                  | Only after defining, mounting, and configuring the element |
| Framework helpers | Register tools in a framework lifecycle                                                           | When the helper runs in its documented lifecycle           |

Core and chat can be consumed without Pi's runtime peers. `/chat` imports controller types only. A fake or application-owned controller can drive the same component. The page's default tool host uses the existing core registry; it does not create a second registry inside the worker.

## One conversational turn

```mermaid
sequenceDiagram
  actor User
  participant UI as Chat or host UI
  participant Page as Page controller
  participant Pi as Pi runtime
  participant DB as IndexedDB
  participant Planner as Configured planner
  participant Tools as Core and application
  User->>UI: Send a message
  UI->>Page: send(text)
  Page->>Pi: Bound request for this document and session
  Pi->>Pi: Acquire the conversation Web Lock
  Pi->>DB: Commit the user turn
  loop Until reply, failure, cancellation, or limit
    Pi->>Page: Discover tools and read current safe context
    Page-->>Pi: Catalog revision and context
    Pi->>Page: Plan exactly one next action
    Page->>Planner: plan(..., singleStep, signal, maxRequestBytes)
    Planner-->>Page: Validated action or text reply
    Page-->>Pi: Planning result
    alt Application action
      Pi->>Page: invoke(name, input, catalog revision)
      Page->>Tools: Validate input and current availability
      opt Important mutation
        Tools->>User: Application approval UI
        User-->>Tools: Approve or deny
      end
      Tools->>Tools: If approved, recheck availability, guard, execute
      Tools-->>Page: Actual result or rejection
      Page-->>Pi: Invocation result
      Pi->>DB: Commit the result
      Pi-->>Page: Publish a detached snapshot
      Page-->>UI: Notify subscribers
    else Reply or failure
      Pi->>DB: Commit the outcome
      Pi-->>Page: Publish the final snapshot
      Page-->>UI: Notify subscribers
    end
  end
  Pi->>Pi: Release the lock and storage resources
  Pi-->>Page: completed, interrupted, or error
```

The runtime never predicts the result of an unfinished action. After a successful action, it discovers tools again. An action that opens an editor can expose a save tool for the next round. A catalog change during planning rejects the old action. Core also rechecks registration identity, schema, scope, and cancellation after approval and guards.

The standalone command input has a different contract: it can execute a validated sequence of up to five planned steps. Pi always requests one next action and replans from actual results. Heuristic fallback is available for ordinary commands; the conversational runtime requires an available planner with `capabilities.conversation === true`.

## State and cancellation

```mermaid
stateDiagram-v2
  [*] --> loading
  loading --> idle: History opened
  loading --> interrupted: Unfinished turn recovered
  loading --> error: Storage or connection failure
  idle --> running: New user request
  interrupted --> running: New user request
  error --> running: New user request
  running --> stopping: Stop
  running --> idle: Completed and persisted
  running --> error: Provider, tool, storage, or budget failure
  running --> interrupted: Worker or document lost
  stopping --> interrupted: Cancellation settled
  idle --> closed: Destroy
  error --> closed: Destroy
  interrupted --> closed: Destroy
  running --> closed: Destroy after cancellation
  closed --> [*]
```

Initialization can reject before a controller exists. `send()` reports its outcome as data; callers must inspect the returned status. `stop()` and `clear()` can reject on transport or storage failures. Closing the popup only hides the view. Removing the element unsubscribes the view. Neither action destroys the controller.

Stop aborts planning and pending approval. It cannot undo an action that already reached the application or server. A lost reply can leave the action's outcome unknown. The runtime does not automatically retry the turn. Heartbeats apply only to the connection and turn that initiated them; a late failure cannot cancel a later turn.

## Persistence and recovery

The session key contains `namespace`, `ownerId`, and `conversationId`. These values partition IndexedDB and the Web Lock. They are not authentication or protection from scripts on the same origin. The host must use the authenticated account identifier, replace the controller on account changes, and choose retention rules.

Each operation opens the bounded log, replays committed entries into Pi's reference store, and closes resources when finished. Writes reach IndexedDB before snapshots become visible. Web Locks prevent competing tabs or controllers from reading, clearing, or writing the same conversation during an active operation. A competing operation receives `conversation_busy` rather than stealing the lock.

On recovery, unfinished tasks are aborted before model or tool execution is enabled. History remains visible, and the interrupted marker persists. Recovery does not replay old actions. Browser storage can be cleared or evicted, and automatic compaction is disabled.

The page's `pagehide` handler stops work when the browser saves the document in the back/forward cache. The restored controller can reconnect on a new user request. Ordinary document disposal destroys it.

## Worker and deployment boundaries

```mermaid
flowchart LR
  Source[Application worker.ts] --> Compile[Vite worker compilation]
  Compile --> Asset[public/webmcp-pi/worker.js]
  Asset --> Site[Application site build and HTTPS hosting]
  Site --> Page[Application page]
  Site --> Dedicated[Dedicated non-root worker scope]
  Page -->|Direct registration and message port| Dedicated
  PWA[Existing root PWA worker] -.->|Continues controlling application requests| Page
```

The dedicated worker has no fetch handler and does not call `clients.claim()`. It does not replace the root PWA worker. It does call `skipWaiting()` during installation. A worker update can interrupt active work; the application must show the interruption and let the user start a new turn.

The host compiles the worker wrapper and serves the resulting module inside its same-origin scope. The worker URL and scope must include the deployment base path. A development `.ts` URL from this repository is not a production asset contract.
