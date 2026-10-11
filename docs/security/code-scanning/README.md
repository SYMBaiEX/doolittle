# CodeQL security review — 2026-10-11

## Executive summary

All **196 open JavaScript/TypeScript CodeQL alerts** from main commit
`473fb15c093c622962b3ca3df3e50f3c01d1c50a` were reviewed. The original scanner
ratings were 6 critical, 188 high, and 2 medium. Those ratings are not the
severity of every confirmed application issue: many flows originate in
intentional operator-selected local paths, test fixtures, or build tools.

This branch fixes demonstrated workspace prompt-file escapes, private-file
creation races, unsafe harness cleanup, and public exception disclosure. It
also prevents manifest-slug traversal discovered while tracing an import
alert and restricts health-probe credential destinations. No remotely
exploitable critical issue was confirmed in the six critical alerts.

The security-best-practices review method separates input authority, the actual
sink, existing defenses, and residual risk. Its React/browser references apply
to renderer boundaries; they do not provide a Node/Electron backend security
specification. Backend findings here rely on concrete source/caller inspection,
regression tests, and the published CodeQL query definitions.

| Source-review disposition | Alerts | Meaning |
| --- | ---: | --- |
| Fixed | 23 | A demonstrated boundary/correctness issue has a local remediation. Several alerts can describe one issue. |
| Hardening | 30 | Defense-in-depth implemented; the original scanner impact was not necessarily demonstrated. |
| Intentional local authority | 116 | Operator-selected paths/executables or local tooling, with per-alert caller constraints and prerequisites. Not automatically a false positive. |
| Test-only | 18 | Fixture/test execution rather than a production capability; specific inputs and trust boundaries documented. |
| False positive | 7 | The reported security boundary is not present, with source evidence. |
| Guarded | 2 | An existing validating control dominates the flagged operation. |
| Unreviewed | 0 | No baseline alert is missing a disposition. |

**These are local review dispositions, not GitHub closure counts.** No alert was
dismissed to reduce the backlog. A fresh CodeQL analysis must establish which
flows disappeared; intentional capabilities may still be reported. The
running/installed desktop app and main/panel branches were not modified by this
security branch.

## Evidence and complete inventory

- [Original 196-alert snapshot](alerts-2026-10-11.json): IDs, original severity,
  rule, location, source commit, and GitHub links.
- [Unified per-alert ledger](ledger-2026-10-11.json): every snapshot ID exactly
  once, classification, reasoning, source/caller line evidence, and relevant tests.
- [Local path authority and recovery](local-path-boundaries.md).
- Review partitions: [critical](triage/critical.json),
  [desktop](triage/desktop.json), [filesystem](triage/filesystem.json),
  [runtime paths](triage/local-paths.json),
  [tooling/tests](triage/tooling-tests.json), [remaining flows](triage/root.json).

Snapshot locations refer to the analyzed main commit; evidence references refer
to this security branch unless explicitly marked baseline. The ledger records
the exact analyzed commit rather than implying a scan of the changed code.

## Findings and remediation

The severities below describe the confirmed boundary/risk, not a blanket
reclassification of CodeQL's original scores.

### 1. High — automatic workspace files could import external host content

Alerts 58–60. Repository-controlled workflow directories/files could be symlinked
outside the selected workspace. Equivalent automatic `AGENTS.md`, `SOUL.md`,
`MISSION.md`, and `ROADMAP.md` context reads had the same boundary gap.

Remediation: canonical workspace containment, sibling-prefix rejection, and
bounded no-follow descriptor reads in
`packages/agent/src/runtime/workflow-commands/definitions.ts:80` and
`packages/agent/src/services/context-files-service.ts:83`. Internal links remain
supported. Automatic Markdown inputs are capped at 1 MiB; invalid workflow
files are ignored with built-in fallback, while context failures are blocked
diagnostic entries and excluded from model context. Tests cover static and
deterministic final-entry swaps, oversized/nonregular inputs, and recovery.

### 2. High — imported manifest slugs could escape their install directory

Found while reviewing alert 153. Manifest-controlled `../` slug segments reached
the generated `SKILL.md` path. This was a real traversal issue even though the
original scanner rule described a temporary-file pattern.

Remediation: reject empty/dot/dotdot segments, require a strict descendant, check
existing canonical ancestors, and verify a private regular descriptor before
writing in `packages/agent/src/services/skills-hub/manifests/imports.ts:29`.
Nested normal slugs and re-imports remain supported; SDK atomic JSON storage
is retained. Traversal, external ancestor/final-file links, and normal recovery
are regression-tested.

### 3. Medium — ambient probe credentials went to any chosen destination

Alert 8 is an intentional operator HTTP(S) probe, not an exposed server-side
URL-fetch endpoint. However, its original request forwarded `ELIZA_API_TOKEN`
to every chosen host.

Remediation: exact trusted-origin matching, default configured numeric loopback
origin, explicit HTTPS remote-authentication opt-in, and `redirect: "error"` in
`packages/agent/src/native-tools/health-probe-core.ts:36`. Unauthenticated remote
probes remain supported. Invalid trusted origins fail before a request. A real
loopback redirect test verifies that the redirect target receives no request.
See [native-tool usage](../../native-tools.md) for compatibility details.

### 4. Medium — SDK exception details escaped through public JSON

Alert 1. The latest SARIF identifies registry search, official skill search, and
MCP search/details exception-to-JSON flows. Ordinary `Error.message` is not a
stack trace, but arbitrary SDK messages/non-Error thrown values could expose
internal paths or credential-bearing transport details.

Remediation: fixed operation-specific public failures at
`packages/agent/src/runtime/native/agent-sdk.ts:141`,
`packages/agent/src/runtime/native/service-bridge/skill-hub/index.ts:237`, and
`packages/agent/src/runtime/native/service-bridge/tooling/mcp.ts:145`. Adjacent registry/skill
sync/install failures use the same policy. Availability and abort contracts
remain intact. Synthetic exception/string fixtures verify that private-looking
paths and secret markers do not enter returned JSON.

### 5. Medium — private-file initialization could overwrite a race winner

Alerts 127, 135, 136, 145 and related hardening flows.

- Secret salt: exclusive 0600 creation; bounded same-descriptor reuse; only
  `ENOENT` permits creation. Empty/invalid/unreadable existing salts fail closed
  rather than silently rotating encryption material
  (`packages/agent/src/runtime/bootstrap/env/secret-salt.ts:24`).
- Gateway journal: exclusive creation or append-only reuse, never truncation of
  a concurrent journal (`packages/agent/src/gateway/recording/journal.ts:18`). Durable short-write
  and fsync behavior is preserved.
- Bootstrap `.env`: exclusive private creation and no-follow, nonblocking,
  regular-file same-descriptor reads/updates
  (`scripts/bootstrap/core/env-file.ts:40`). A pathname swap cannot redirect the
  subsequent write; FIFO inputs fail rather than hanging before validation.
- Job directories/logs: private creation, exclusive log creation, and one
  validated append descriptor shared by child stdout/stderr
  (`packages/agent/src/cli/jobs/store/index.ts:22`, `packages/agent/src/cli/jobs/lifecycle.ts:86`).

Existing salt recovery requires restoring the original salt or its explicit
configured override; no automatic regeneration or user-state deletion occurs.
Concurrent first initialization may safely fail until the winning write is
complete.

### 6. Medium — diagnostic harnesses could damage non-disposable paths

Alerts 19–26 and 178–184.

Screenshot cleanup no longer recursively deletes operator-selected `desktop`
or `narrow` directories. It validates dedicated non-linked evidence roots and
removes only known generated PNG basenames/manifest
(`e2e/support/screenshot-evidence.ts:12`). Unrelated files survive.

The profile sweep no longer deletes PGlite lock or postmaster PID files from
an arbitrary explicitly supplied profile. Such profiles fail closed when lock
entries exist; use the default scrubbed temporary profile or a verified
inactive, prepared clone. Never remove an active profile's locks to bypass
the guard (`e2e/support/explicit-sweep-profile.ts:1`).

Coding-eval reports reject broad root/home/current-checkout output directories,
apply permissions to a verified directory descriptor, and exclusively create
0600 reports (`packages/evals/src/coding/report.ts:300`). Dedicated custom output
directories remain supported.

### 7. Low — check-then-read/reopen operations warranted descriptor hardening

Desktop artifact/selection/import and agent evidence/metadata readers now
validate bounded regular files on the opened descriptor. Desktop staged writes
retain that descriptor through content verification and fsync. Existing digest,
artifact identity, explicit selection, approval, and rollback checks remain.
Oversize/growth/shrink/rewrite/failure cases are covered where applicable.

This reduces leaf-file races; it does not prove that every old stat/read pair
was an exploitable high-severity vulnerability.

### 8. Informational — metadata keys and capped JSON recovery

Alert 141 now allowlists the three consumed workflow metadata fields. No prior
prototype pollution was demonstrated with its string-valued, nonrecursive
assignment (`packages/agent/src/runtime/workflow-commands/frontmatter.ts:27`).

Alert 13's capped search-prefix parser no longer re-escapes already JSON-encoded
quotes; it uses `JSON.parse` as data decoding. Quote/backslash regressions pass.
No code execution or HTML-sanitization boundary was demonstrated
(`packages/plugins/doolittle-plugin/sdk-native-surface.ts:115`).

## Proven non-issues and intentional boundaries

The seven documented false positives are 9–12, 118–119, and 226. Examples:
HTML/comment cleanup produces plain text or heading identifiers, not safe HTML;
SVG capture text independently uses SDK XML escaping. CLI verification modes
select distinct validations rather than remote authorization exemptions.
Fixture environment scrubbing only clears existing own keys.

The four test-only critical flows execute trusted SDK/test sources or explicitly
configured local executable paths. The desktop launch critical flow captures
trusted launch authority and uses argv execution; `shell: false` alone is not
the justification. See each ledger row for prerequisites and source evidence.

Intentionally configurable data roots, project inspection, provider homes, and
shell/PATH discovery remain capabilities of the local operator. They are not
silently confined to the active workspace. SDK beta.7 pins and existing SDK
atomic JSON/Vault/account primitives were preserved.

## Verification and remaining limits

Focused regressions passed for each changed boundary. Independent read-only
review validated all 196 unique evidence-backed dispositions, source locations,
and normal/failure/recovery coverage without missing or duplicate IDs. The
ledger's two coverage checks also passed.

| Validation | Result |
| --- | --- |
| `nub run typecheck` | Passed, including the UI workspace. |
| `nub run desktop:typecheck` | Passed. |
| `nub run test` | Passed: 56 tests across 8 essential files. |
| `nub run test:all` | 6,716 passed, 74 failed, 7 skipped across 1,050 files. The 74 failures are reproduced on the unchanged baseline below. |
| `nub run build` | Passed: agent and ACP bundles. This is not desktop packaging. |
| `nub run lint:check` | Passed with 9 existing unused-suppression warnings in unchanged files. |
| `nub run check:acceptance` | Passed: hygiene, workflow security, plugin/SDK boundaries, documentation, links, dependency analysis, and production critical-advisory audit. |
| `git diff --check` | Passed. |

The full suite is **not green**. A disposable archive of the exact baseline
`473fb15c093c622962b3ca3df3e50f3c01d1c50a`, using the same installed dependencies,
reproduced all 74 failures with:

```sh
nub run test:scope \
  packages/agent/src/runtime/chat-turn-provider-handler.test.ts \
  apps/desktop/src/renderer/components/ElizaControls.test.tsx \
  apps/desktop/src/renderer/components/PanelResizeHandle.test.tsx \
  apps/desktop/src/renderer/components/VoiceComposerButton.test.ts
```

Baseline result: 74 failed and 189 passed out of 263 tests in these four files.
The provider-handler file accounts for 71 failures; each renderer file accounts
for one. These source/test files were not changed by this security pass. Their
baseline failures remain a release gate; they were not silenced or fixed by
changing unrelated expectations.

Still outside these guarantees:

- Mutable ancestor directories, hard links, or compromise of the local OS user.
  Canonical path checks plus a no-follow final descriptor are not an OS sandbox.
- Windows filesystem/ACL/no-follow behavior and cross-platform native runtime
  testing; macOS tests do not certify those boundaries.
- Native ScriptC compilation/binary integration of the probe, desktop packaging,
  installation, real provider calls, or deployment.
- Fresh GitHub CodeQL closure, security-alert dismissals, and dependency
  advisories. The baseline main-branch alerts are not changed by local checks.

After scanning the branch/PR, reconcile scanner results with this ledger.
Dismiss only exact evidence-supported false positives or explicitly accepted
intentional boundaries with a specific reason; do not bulk-dismiss to reach zero.

Query references: [path injection](https://codeql.github.com/codeql-query-help/javascript/js-path-injection/),
[filesystem races](https://codeql.github.com/codeql-query-help/javascript/js-file-system-race/).
