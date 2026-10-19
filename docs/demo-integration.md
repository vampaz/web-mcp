# Later standalone demo adoption

Adopt the published package only after the local lab, real-model lane, isolated package fixtures, and review gate pass. This repository's implementation does not edit the sibling demo.

1. Install a reviewed kit version from `0.2.1` onward; npm installs its Pi runtime dependencies automatically. Verify all three imports and the worker entry from the tarball rather than sibling source aliases.
2. Replace the duplicate Pi loop, model bridge, page connection, and IndexedDB implementation with `/pi`. Retain application-owned tool registration, current safe context, guards, confirmation UI, and model configuration.
3. Compile a small `/pi/worker` wrapper into a dedicated same-origin URL/scope. Preserve the application's PWA worker. Confirm the page can connect without being controlled by the Pi scope.
4. Replace the duplicated conversation renderer with `/chat`. Configure text, controller, CSS properties, and `mode: 'popup'` in code. The package supplies the draggable launcher and resizable panel; remove the duplicate demo popup shell when adopting it. Keep account/provider/model UI in the host. Keep the existing bounded command-input resolution independent.
5. Destroy the old controller and cancel approval UI on navigation, account/provider changes, and unmount. Await cancellation before installing a replacement. If asynchronous initialization finishes after unmount, destroy that late controller immediately.
6. Design and test the anonymous-history migration explicitly. The old `webmcp-pi-v1:<pathname>` key has no verified account owner. Import it only into a clearly identified anonymous partition with user-controlled clearing. Never assign that history to whichever signed-in account opens the page.
7. Run consumer E2E for actual tools, approved and denied mutations, result feedback, cancellation during approval, route changes, reload without replay, account partitions, New chat, and worker/PWA coexistence. Source tests in Kit do not prove the consuming deployment's worker URL or CSP.

Release stages remain separate: reviewed code, automated tests, verified npm artifact, package publication, consumer rollout, deployment, and live behavior. No publication or deployment is performed by local package development. External provider login, extension authentication, and credit accounting remain later deliverables.
