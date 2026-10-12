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

## Native acceptance

```sh
nub run test:integration              # build agent; real shared-engine SDK workers
nub run test:e2e:desktop-workbench     # build desktop; four real Electron journeys
nub run test:e2e                      # both source runtime and native desktop
nub run test:all                      # fast boundaries plus native acceptance
nub run check:release:static          # lint, types, boundaries, build, security/audit
nub run check:release                 # static + native + clean-HEAD package smoke
```

Runtime acceptance covers two named workers in one engine, chat-specific roots,
offline run attribution, ACP ownership, worker restart/history, automation
handoff and cancellation. Native desktop acceptance covers conversational bot
creation and provider/model selections, first chat, exact remembered project
consent across chats/reload/restart, refusal/isolation, and sidebar stability
across actual catalog polls. Package smoke covers preload, private scratch PTY
and offline chat using the provenance-checking runner.

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
