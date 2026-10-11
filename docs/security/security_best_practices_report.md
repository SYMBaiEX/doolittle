# Security remediation — 2026-10-11

## Executive summary

PR #32 was closed unmerged; its checkpoint branch remains at `9439a4b2`.
Remediation starts from merged `main` commit `90ad26af`, with **162 open CodeQL
alerts (6 critical, 155 high, 1 medium)** and **10 production dependency
advisories (2 high, 7 moderate, 1 low)**. These scanner ratings are not a count
of demonstrated exploitable application vulnerabilities. No alert is dismissed,
query disabled, or scanned path excluded by this work.

The current per-alert baseline is
[remediation-baseline-2026-10-11.json](code-scanning/remediation-baseline-2026-10-11.json).
Existing triage is evidence to revalidate, not proof of current closure.

## Findings requiring code or dependency work

### SR-1 — Automatic SOUL context escapes the workspace reader boundary

Severity: High. Impact: automatic context can import an external/ancestor file
or perform an oversized read despite the workspace context service's bounds.

Evidence: `packages/agent/src/runtime/soul.ts:20` walks eight ancestor directories;
`:43` checks metadata separately and `:48` reads the entire pathname before
truncating. `packages/agent/src/providers/agent-context/provider.ts:166` adds that
result automatically. The parallel ContextFilesService path already canonicalizes
workspace containment and uses a bounded regular-file reader.

Required remediation: explicitly trust-bound SOUL discovery, descriptor-pinned
bounded reads, no automatic external-symlink/ancestor import, and normal/edit/
delete/oversize/symlink/ancestor regressions. Preserve explicitly authorized
nested-workspace behavior only within a stated trusted root.

Status: implemented. Default discovery stays inside the canonical workspace;
ancestor lookup requires an explicit trusted root. Reads are descriptor-pinned
and capped at 1 MiB, text remains capped at 5,000 characters, and the mtime-only
cache was removed. A follow-up rejects all SOUL leaf links and opens the
validated candidate rather than the canonical target. Seven focused tests and
30 initial related tests passed; root type
checking, targeted Biome, and diff checks passed. FIFO regression is Unix-only;
native Windows post-check substitution remains unverified. Trusted ancestor
directories must remain stable; this is not an OS sandbox.

### SR-2 — Legacy production dependency advisories

Severity: scanner High/Moderate/Low by advisory. Impact varies by exposed
consumer; native overflow, parser denial of service, prototype pollution, and
cryptographic compatibility require distinct evidence.

The two high packages, `bigint-buffer` and `braces`, already have local
mechanism-mitigation patches; their upstream versions remain reported.
The remaining consumers concern `decode-uri-component`, `elliptic`,
`file-type`, `sprintf-js`, `stream-json` (three advisories), and `uuid`.
No blind major override or fake safe package version is an accepted fix.

Required remediation: current consumer/version mapping, supported parent/API
migration or maintained replacement where feasible, focused compatibility and
adversarial tests, exact ElizaOS beta.7 alignment, and a fresh full graph audit.
No-upstream-fix limitations must remain visible.

Status: dependency migration discovery in progress.

### SR-3 — Test-server error detail disclosure

Severity: Low, test-only. `packages/agent/src/testing/fetch-server.ts:38` returns
a thrown diagnostic in an ephemeral loopback test HTTP response. It has three
test importers, not two as older triage states. A generic response can remove
the diagnostic from the boundary while preserving useful local test evidence.

Status: scoped cleanup pending; not a production remote vulnerability claim.

### SR-4 — Trajectory HTTP manifest and referenced-data paths

Severity: High, authenticated API boundary. Impact: a caller with trajectory
route access can supply an arbitrary local manifest path, then a manifest can
redirect record reads through its stored dataPath. This is not claimed to be
unauthenticated access.

Evidence: trajectory replay/evaluation/compare/compress/benchmark routes pass
manifestPath to service catalog methods. `services/trajectory/service/catalog.ts:20`
forwards without a service-root check; `bundle-storage/listing.ts:25` and `:73`
read arbitrary JSON/JSONL paths. `bundle-replay.ts:54` trusts manifest.dataPath.

Required remediation: authorize manifests and referenced artifacts at the
per-service trajectory root, pinned bounded reads, normal generated bundle
compatibility, and route-level traversal/absolute-path/symlink/oversize failures.

Status: implemented and independently reviewed. Manifest, data, and
benchmark-case reads are confined to the configured trajectory root, restricted
to regular files, and capped (1 MiB manifests, 32 MiB records). Consumed optional
fields are validated. Real-service HTTP regressions cover unsafe requested and
referenced paths, malformed schemas, static 400 responses, and valid replay.
Eighteen focused and 39 related tests passed, plus type/Biome/diff checks.
An independent rerun passed 16 directly scoped tests.
Directory enumeration remains unbounded; trusted ancestor stability and native
Windows no-follow semantics remain limitations.

### SR-5 — Persisted CLI job records redirect log I/O

Severity: High when the configured data root can be modified by an untrusted
workspace writer. Impact: crafted jobs.json records can redirect reads and
append/chmod operations to an arbitrary regular file outside the jobs root.

Evidence: `cli/jobs/store/index-store.ts:25` parses stored records without
reconstructing paths; `store/events.ts:30` and `store/index.ts:84` trust logPath.
Safe creation of new UUID jobs does not validate replayed records.

Required remediation: validate persisted identity/path authority at load and
use, derive expected state/log paths, reject escaped or linked descendants,
retain legitimate existing jobs, and test crafted indexes plus benign replay.

Status: implementation queued.

### SR-7 — Detached jobs trust persisted PIDs and expose prompt arguments

Severity: High when the configured job store can be modified, or a saved PID is
reused. `cli/jobs/lifecycle.ts:55` signals the persisted PID and marks a job
cancelled even when signaling fails. `store/events.ts:30` treats PID existence
as ownership. Background launch also places the full prompt in child argv.

Required remediation: child-owned durable cancellation requests, truthful
request-versus-confirmation status, no signaling of a stored PID, validated
private job paths, bounded stdin prompt delivery, and cross-restart/concurrent
writer regressions. A PID command-line check is not an ownership proof.

Status: implementation planned; existing child turn abort signal is reusable.

### SR-8 — Automatic private-state reads and shared-memory writes

Severity: Medium, configured state-root boundary. Memory, settings, profiles,
and autocoder stores use unbounded, link-following automatic reads. Shared
MEMORY.md writes follow the final path and create plaintext files without an
explicit private mode. Profile mutation can update its cache before persistence
succeeds. SDK atomic JSON uses a predictable, nonexclusive temporary filename.

Required remediation: bounded pinned reads, cache/persistence consistency,
exclusive private atomic writes, safe legacy migration, and dedicated directory
privacy. Preserve authorized absolute roots and the SDK atomic primitive where
its mechanism can be hardened. Mutable ancestors remain a separate trust
requirement; this is not a demonstrated unauthenticated remote path choice.

Status: source plan complete; implementation pending.

### SR-6 — Unbounded/link-following eval report reads

Severity: Medium, local operator/report-directory boundary. Impact: a planted
report entry can cause an unintended external read, excessive allocation, or
FIFO blocking before JSON/schema validation.

Evidence: `packages/evals/src/coding/report.ts:531` reads a selected report;
`:662` reads every discovered JSON entry without a pinned regular-file bound.

Required remediation: bounded, descriptor-pinned report readers, no-follow and
nonblocking flags where supported, and linked/oversized/nonregular regressions.

Status: implementation queued.

## Current scanner review coverage

- Non-test, non-filesystem lane: 13 alert IDs inspected. No demonstrated remote
  exploit found in those inspected paths; local operator capability, text-only
  output, package mode selection, and controlled dictionary writes remain
  distinct. This is not GitHub scanner closure.
- Test/helper lane: 22 alert IDs inspected. Deliberate race, symlink, SDK gate,
  and account-store fixtures must remain effective and scanned. Evidence-backed
  false-positive dispositions are individual, not a blanket test exclusion.
- Filesystem lane: 127 alert IDs across 58 files source-reviewed, including the
  automatic SOUL reader and fixed Codex models-cache reader.
  Operator-selected absolute data/output roots must remain supported. Additional
  profile/settings/report read hardening is being evaluated separately.

## Verification and release

Pending: focused regressions for changes, complete per-finding dispositions,
independent review, integrated release checks, and fresh GitHub scans.
Earlier shared-engine release checks do not certify this new security branch.

