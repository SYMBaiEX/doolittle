# October 2026 repository cleanup

This scoped source/test cleanup removes disconnected implementations and old
layout snapshots. It does not change the installed application, runtime state,
credentials, dependency overrides, generated runtime-truth documents, or
historical verification evidence. Tracked deletions remain recoverable through
Git. No ignored output directories were deleted.

## Removed disconnected source

- `components/ProjectHistorySidebar.tsx`, `ProjectSidebarControls.tsx`,
  `project-sidebar-model.ts`, and `project-sidebar-layout.ts` in the desktop
  renderer formed an unused project-sidebar subtree. References outside that
  subtree existed only in its three dedicated tests, removed with the source.
- Renderer `app-shell/DesktopWindowContext.tsx` had no application consumer;
  only its dedicated test imported it. Both were removed. The active shell and
  its navigation, focus, project-binding, and view-state tests remain.
- Agent `server/routes/conversation/lifecycle.ts` exported an unused
  `followAbortSignal` adapter. The active request lifecycle and the private,
  independently used gateway abort helper remain unchanged.
- Agent `services/command-process.ts` and `services/delegation/descendants.ts`
  were test-only wrappers with no production callers. Their dedicated tests
  were removed; process execution, run-controller, and delegation behavior
  coverage remains.
- Agent `services/terminal/cloud/index.ts` was an unused re-export barrel.
  Its namespace-shape test was removed; the preserved planning behavior test
  now imports its helpers directly from their implementations. Terminal
  execution still imports the backend/planning implementations directly.

These removals comprise nine source files (1,131 lines) and seven dedicated
tests (587 lines). Knip's file inventory was followed by repository-wide import,
export-symbol, configuration, and documentation reference searches. The UI and
workflow owners approved the affected boundaries. Knip's unused-file output is
not itself deletion authority: Electron/build entries, CLI/native utilities,
test fixtures, and the exact-beta resolver shims have active consumers and were
preserved.

## Retired implementation snapshots

Removed eleven renderer tests (909 lines): `dashboard-layout`, `review-layout`,
`settings-layout`, `typography-spacing-contract`, `viewport-density`,
`workbench-layout`, `chat/message-actions-layout`, `keys-layout`,
`gateway-density`, `runtime-layout`, and `no-custom-css-regression`.
These froze JSX/CSS/class strings or the retired Tailwind-only authoring policy,
not the rendered interaction. No configuration or documentation named those
test files.

Reduced `css-selector-reachability.test.ts` from 222 to 41 lines. The historical
negative selector lists and implementation-presence checks were removed; the
actively needed official Eliza component Tailwind-source guard remains.
Persistence, event grouping, contrast/token safety, reduced-motion/focus,
rendered behavior, and accessibility checks remain. In total: 27 deleted files,
one reduced migration test, one redirected behavior test, and 2,809 net
source/test lines removed.

## Verification boundary

Scoped checks: `git diff --check`, `nub run check:local-links`,
`nub run check:repo-hygiene`, a formatter check of the reduced test, and repeat
reference scans. No full test suite, commit, installation, or release is part of
this cleanup. These checks do not establish runtime or installed-desktop
behavior; release verification belongs to the owning overhaul workflow.
