# Development and testing

The legacy test corpus was retired. All maintained tests now live in `tests/`;
there is no hidden full-suite lane. Production evaluation tools remain separate.

## Routine feedback

```sh
nub run test
nub run test:scope tests/boundary/project-access.test.ts
nub run test:related apps/desktop/src/main/bot-api.ts
nub run test:watch:scope tests/boundary/workspace-refresh.test.ts
```

The fast suite tests actual approval persistence, cancellation and stale-dialog
refusal, cross-bot ownership, execution-parent admission, and refresh races.
No source-text snapshots or skipped environment opt-ins count as coverage.
`test:scope` needs a direct filter without a literal `--`. Related tests follow
static imports; select explicit tests for dynamic runtime/IPC registration.
No matching tests is a failure. Desktop/UI test commands reuse this root suite.

## Live desktop development

```sh
nub run desktop:dev
```

Vite serves the renderer with hot module replacement. Watch builds compile the
Electron main/preload code and both CLI runtime entries incrementally, including
imported shared workspace sources. Skills and character Markdown/JSON changes
also reload the dev app. Changes are coalesced into one restart after all affected
builds succeed. Compilation failures keep the current app alive and recover on
the next successful edit. A nonzero Electron exit keeps the watchers running so
fixing the source can relaunch it.

A restart asks the dev Electron process to quit through its normal SDK/runtime
shutdown path and waits for exit before opening a replacement. This stops active
dev runs and flushes saved state. A refused or stalled safe quit pauses reload;
quit that dev app normally and restart the command. The supervisor does not
force-kill a runtime with open data files.

The persistent default profile is `var/desktop-dev/profile`, separate from the
installed app. To choose another profile or renderer port:

```sh
DOOLITTLE_DEV_PORT=5174 nub run desktop:dev -- --user-data-dir=/absolute/private/dev-profile
```

No package/install command is part of this loop. Restart the dev command after
installing dependencies or changing the dev supervisor/build configuration.

For changes to this workflow, use:

```sh
nub run test:scope tests/boundary/desktop-dev-reload.test.ts
nub run test:dev:desktop
```

The opt-in native journey uses a temporary offline profile and real Electron. It
temporarily adds/removes uniquely tagged edits in the checkout to verify UI hot
updates, main/preload/runtime replacement, old-runtime exit, compile-error
recovery and supervisor cleanup. It preserves other edits and is separate from
the ordinary release journeys. Its process-ownership probe currently uses POSIX
`ps`, so that journey runs on macOS/Linux and explicitly skips Windows.

## Completion and appearance boundaries

The provider turn handler owns SDK execution, cancellation and planner budgets.
Its completion rules have explicit owners under
`packages/agent/src/runtime/chat-turn/`:

- `provider-receipts.ts` merges SDK projections with scoped originals once for
  both success and failure recovery. Preserve receipt occurrence order; a later
  server observation invalidates that session's earlier readiness.
- `workspace-evidence.ts` pins mutation scope and rejects unverified chronology
  before applying the existing `workspace-noop-completion.ts` receipt contract.
- `frontend-review.ts` owns server constraints, review freshness and captured
  interactive-text blockers. An attempted review is not a quality pass.
- `workspace-continuation.ts` owns unfinished-work admissions, fresh requested
  checks, bounded continuation evidence and incomplete-result messages.

Run `nub run test:scope tests/boundary/workspace-completion.test.ts` when changing
these rules. The cases exercise receipt recovery, no-edit handoffs, stopped
servers, workspace isolation, check identities and blocker clearance. They do
not replace the real-worker journey when SDK registration or execution changes.

Desktop appearance state and theme subscriptions belong to
`apps/desktop/src/renderer/use-desktop-appearance.ts`; `App.tsx` consumes its
resolved appearance and setter. Use
`nub run test:scope tests/boundary/desktop-appearance.test.ts` for saved
preferences and settings/shell synchronization. This is DOM behavior coverage,
not native desktop or rendered visual acceptance.

## Native acceptance

After a scriptless dependency install, prepare the isolated browser fixtures:

```sh
nub run desktop:runtime:install
nubx playwright install chromium
```

Linux CI uses `nubx playwright install --with-deps chromium` to also install
system libraries. These fixtures use temporary profiles, not your personal
browser or installed Doolittle profile.

```sh
nub run test:integration              # CLI, SDK workers and isolated browser protocols
nub run test:e2e:desktop-workbench     # build desktop; four real Electron journeys
nub run test:e2e                      # both source runtime and native desktop
nub run test:all                      # fast boundaries plus native acceptance
nub run check:release:static          # lint, types, boundaries, build, security/audit
nub run check:release                 # static + native + clean-HEAD package smoke
```

CLI acceptance exercises the built executable from an external directory and a
real pseudo-terminal: help/version, JSON output, interactive chat, session
commands and clean shutdown. Its offline recovery path never echoes assembled
model prompts. Runtime acceptance covers two named workers in one engine, chat-specific roots,
offline run attribution, ACP ownership, worker restart/history, automation
handoff and cancellation. Native desktop acceptance covers conversational bot
creation and provider/model selections, first chat, exact remembered project
consent across chats/reload/restart, refusal/isolation, and sidebar stability
across actual catalog polls. Package smoke covers preload, private scratch PTY
and offline chat using the provenance-checking runner. Browser acceptance uses
the ElizaOS provider's Puppeteer dependency over CDP and WebDriver BiDi to click,
read page state, take screenshots and reject invalid protocol requests.

Fixtures use private temporary profiles/workspaces and no host credentials.
Native fixtures wait for the SDK's deferred initialization, not just API health;
immediate project-chat responsiveness during cold hydration is not certified.
Offline model-unavailable output is intentional, not paid-provider quality
evidence. Cleanup retains fixture data if shutdown fails. These cases do not
certify every plugin, live provider, external integration, container engine,
native capture platform, or 50-agent throughput. Add one focused behavior case
or extend a journey when a concrete regression requires it; do not restore
thousands of implementation-detail assertions.

The package gate requires committed, clean source and an artifact manifest
matching HEAD and app.asar. It does not install or publish the app or certify
notarization. `test:essential` and `test:release` are compatibility aliases for
the fast suite; `check:all` aliases the complete release gate. CI runs the fast
gate first, then source workers, native desktop and the packaged smoke.

Security scanners, dependency policy, bundled-runtime audits, SDK patch checks
and local-link validation remain enabled. A small test suite complements them;
it does not replace security review or upstream integration evidence.

## Live coding acceptance

`nub run test:live:coding` explicitly uses the existing linked Codex account.
It runs a small repair once through the built CLI and once through native desktop
chat. Each client receives a private temporary workspace and SDK state directory;
the existing account is reused without copying credentials into test fixtures.
Traces, screenshots and video are disabled. The parent checks the implementation
changed, the supplied verifier stayed unchanged, the run reached completion, and
`node --test` passed independently. The command can make paid/subscription model
calls and requires usable linked authentication; it is excluded from CI and the
offline release gate. Failed fixtures remain private for diagnosis; successful
fixtures are removed after shutdown.
