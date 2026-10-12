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
The updated [162-alert source disposition ledger](code-scanning/remediation-dispositions-2026-10-11.json)
separates historical triage from current source anchors. It does not close
GitHub alerts or claim a fresh scanner result.

The [first fresh branch scan review](code-scanning/remediation-fresh-scan-2026-10-11.md)
separately covers all 53 results from analysis `1933033304` at `0c631e9d`.
Its 47 production-boundary and six fixture dispositions are not a blanket
false-positive dismissal or final-head scanner closure.

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

Status: integrated and independently reviewed. Scoped Jayson 5 browser-client
and Electron-builder get 5 upgrades remove the three stream-json advisories.
Seven version-based findings remain (2 high, 4 moderate, 1 low), each covered
by a mechanism patch while retaining its truthful published version:

| Dependency | Mechanism repair |
|---|---|
| bigint-buffer 1.1.5 | Existing pure-JavaScript replacement avoids the vulnerable native binding. |
| braces 3.0.3 | Existing bounded nesting/ancestor traversal patch. |
| decode-uri-component 0.2.2 | Upstream single-pass decoder backport, preserving CommonJS/plus-as-space. |
| elliptic 6.6.1 | Preserve raw DRBG byte length before nonce truncation; public P-521 vector. |
| file-type 16.5.4 | Reject invalid ASF sizes and enforce monotonic, bounded scanning. |
| sprintf-js 1.0.3 | Clamp numeric precision before formatting; do not replace one uncaught RangeError with another. |
| uuid 8.3.2 / 9.0.1 | Validate output buffer bounds before mutation across published entrypoints. |

SDK atomic JSON now uses exclusive random temporary files and owned descriptors;
failed creation cannot remove another writer's temporary entry. Its additive
`exclusive` option publishes by hard link without overwriting a final file or
symlink; default replacement remains unchanged. Job control uses that SDK option,
and concurrent cancellation requests validate the winning id/nonce. Hard-link
support on native Windows and other filesystems remains unverified. Main-checkout
frozen reinstall and 46 dependency/policy tests passed. Consumer checks include
loopback RPC/download checksums, Jimp bytes, Mammoth/argparse formatting, and
actual nested dependency copies. The release review gate now covers every
advisory severity, exact ranges/severities, and audit failures. This is review
coverage, not a zero-advisory or GitHub closure claim.

### SR-3 — Test-server error detail disclosure

Severity: Low, test-only. `packages/agent/src/testing/fetch-server.ts:38` returns
a thrown diagnostic in an ephemeral loopback test HTTP response. It has three
test importers, not two as older triage states. A generic response can remove
the diagnostic from the boundary while preserving useful local test evidence.

Status: implemented. HTTP failures return a generic 500; an optional volatile
diagnostic observer cannot prevent the response even if it throws. Covered by
the independently rerun state/read test scope. This remains test-only.

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

Status: implemented and independently reviewed together with SR-7. Stored
UUID identities and derived state/log paths are validated under a private job
root, index and log reads are capped at 16 MiB, linked/hardlinked entries are
rejected, and index mutations are serialized. New jobs retain private modes.

### SR-7 — Detached jobs trust persisted PIDs and expose prompt arguments

Severity: High when the configured job store can be modified, or a saved PID is
reused. `cli/jobs/lifecycle.ts:55` signals the persisted PID and marks a job
cancelled even when signaling fails. `store/events.ts:30` treats PID existence
as ownership. Background launch also places the full prompt in child argv.

Required remediation: child-owned durable cancellation requests, truthful
request-versus-confirmation status, no signaling of a stored PID, validated
private job paths, bounded stdin prompt delivery, and cross-restart/concurrent
writer regressions. A PID command-line check is not an ownership proof.

Status: implemented and independently reviewed. A private per-job nonce
addresses durable cancellation requests; only the matching child aborts its
turn and confirms the terminal state. Saved PIDs are not signaled. Static and
runtime prompt paths use the same identity boundary, prompts travel through
bounded stdin, and detached stdout/stderr cannot bypass structured log bounds.
Eighteen focused files passed 115 tests; an independent 12-file rerun passed
75 tests. Type/Biome/diff checks passed. Real loopback child-process cancellation
and four concurrent index writers were tested, not live provider accounts.

Availability limitation: an abandoned `.index-lock` fails closed after a
bounded wait. Stop all Doolittle and detached-job writers before manually
removing only that empty lock directory under the configured `cli-jobs` root.
No automatic PID-based lock breaking occurs. Native Windows and production
launcher/provider behavior remain unverified.

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

Status: implemented and independently reviewed; the SDK atomic JSON patch is
integrated. Memory/settings reads and writes are capped at
1 MiB, profile/pipeline state at 4 MiB, and artifacts at 5 MiB. Unsafe existing
state fails visibly instead of being overwritten. Dedicated owned child
directories are descriptor-checked and tightened to 0700 without chmodding the
configured parent. Shared memory uses exclusive 0600 atomic text replacement.
Cloned profile/settings caches cannot be changed by public return-value mutation
or unsuccessful persistence. Artifact growth is tested without a large
allocation. Independently rerun eight files passed 59 tests; broader related
checks, types, targeted Biome and diff checks passed.

### SR-6 — Unbounded/link-following eval report reads

Severity: Medium, local operator/report-directory boundary. Impact: a planted
report entry can cause an unintended external read, excessive allocation, or
FIFO blocking before JSON/schema validation.

Evidence: `packages/evals/src/coding/report.ts:531` reads a selected report;
`:662` reads every discovered JSON entry without a pinned regular-file bound.

Required remediation: bounded, descriptor-pinned report readers, no-follow and
nonblocking flags where supported, and linked/oversized/nonregular regressions.

Status: implemented and independently reviewed. Selected and listed reports
use descriptor-pinned regular-file reads capped at 16 MiB, with final-entry
identity/no-follow, nonblocking, and single-link checks. Valid comparison/listing
and unsafe entry regressions passed in the shared state/read test scope.
Enumeration across a large directory and mutable ancestor stability remain
separate limitations. Native Windows semantics remain unverified.

Additional hardening: the operator-selected Codex `models_cache.json` metadata
read is bounded at 8 MiB; no real user cache, credentials, or live provider
calls were needed to test this boundary.

### SR-9 — Project dotenv fallback changes application configuration

Severity: High configuration-authority boundary. When the fixed application
`.env` file was absent, `config/env/load.ts` called dotenv without a path,
silently loading the current project's `.env`. That gave an opened workspace
an unintended route into application configuration. Existing inherited values
were protected by `override: false`, but absent settings were not.

Status: implemented. Only the explicitly resolved application-root `.env` is
read, using the shared pinned regular-file reader with a 256 KiB cap and a
single-link requirement. Missing files are benign; unsafe I/O fails with a
static error before environment mutation. Dotenv's own parser/populator retains
inherited-value precedence without any current-directory or ancestor fallback.
The application's checkout/installation root and inherited process configuration
remain operator-controlled authority; arbitrary opened projects are not.

Six focused tests and 48 related tests passed, with types/Biome/diff checks.
Real isolated child processes exercise both present and absent application
files with the project as the actual cwd. Linked, multiply linked, FIFO and
oversized files fail without mutation. The Unix FIFO test ran on macOS; native
Windows behavior remains unverified. Release evidence recorded below predates
this follow-up and must be rerun before delivery.

### SR-10 — SQL SDK directory selection reimports project environment

Severity: High worker/configuration boundary. The actual published SQL plugin
Node resolver loaded a cwd/ancestor `.env` before selecting its PGlite directory,
even when an explicit directory was supplied. Non-override mode protected
already-set values but let a project populate unset credentials/settings after
the host-approved worker-environment boundary.

Status: implemented through a version-preserving SDK patch in both published
Node ESM and CJS artifacts. Database-directory resolution no longer imports an
environment file or mutates process environment. Explicit directory, inherited
`PGLITE_DATA_DIR`, and default precedence remain unchanged. The private fallback
argument is unchanged in source but not directly exercised by the public factory.
Application configuration belongs to the explicit application loader, not a
storage helper.

The actual public adapter factory reproduced marker injection before the patch.
Isolated child tests verify unrelated environment remains unchanged for cwd and
ancestor files across both entrypoints, while public directory precedence cases
still work. Children receive only fixture home/configuration and the explicitly
tested inherited directory, never real database URLs or account stores. Frozen
reinstall, seven focused tests, SDK alignment, Biome and diff checks passed in
the isolated candidate; an independent public-factory rerun passed. Integrated
release and packaged acceptance must be rerun for this SDK follow-up.

### SR-11 — Git marker discovery reopens unchecked metadata

Severity: Medium, implicit local metadata read. Both repository discovery and
mutation state checks read a `.git` marker without a bound after separate
pathname checks. Malformed FIFOs, symlinks, oversized files or a different-inode
replacement could block or redirect that implicit read.

Status: implemented. Both callers share a 4,096-byte pinned regular-file
reader; ordinary `.git` directories and real linked-worktree `gitdir:` markers
remain supported. The 22-test repository suite covers discovery and mutation,
including malformed markers and different-inode replacement. Marker-specific
error assertions prevent ordinary no-merge errors from satisfying rejection
tests. This is source remediation, not a false-positive dismissal of #131.

### SR-12 — Account fixtures inherit operator SDK storage

Severity: Medium, test-isolation boundary. Two Claude auth subprocesses passed
temporary Doolittle storage but inherited `ELIZA_HOME`, credentials and startup
options. The published SDK honors `ELIZA_HOME` independently, so fake account
writes could escape the fixture when that variable was configured.

Status: implemented. Both children use an explicit environment allowlist,
pin home, SDK config and account storage to temporary fixtures, skip import-time
dotenv as workers, and receive only explicit fake credentials/fetch payloads.
Nine scoped tests passed, including hostile inherited-settings exclusion and
actual SDK account-record creation inside the fixture. Genuine subprocess
refresh/persistence coverage remains intact. The local executable/PATH remains
test-runner authority; this is not an OS sandbox for a hostile operator.

### SR-13 — Paired conversation access reaches host-wide project inspection

Severity: High, caller-capability boundary. Paired gateway senders have
conversation access, not global machine operator access. Workspace inspection
previously always validated and ignored message provenance, allowing absolute
or home-relative project inspection and home-wide codebase discovery.

Status: implemented. Both validation and direct handler execution now enforce
the existing global-operator policy before parsing parameters or acquiring a
service. Trusted gateway metadata takes precedence over a forged content source.
CLI/authenticated API operator selection remains supported. Nine tests passed,
covering paired platform sources, missing provenance, spoofed source, all three
intents and zero service acquisition on denial. Source/handler evidence supports
the defect and fix; a live messaging-provider exploit was not performed.

### SR-14 — Release and documentation inputs lack bounded descriptor binding

Severity: Medium, release-input integrity and availability boundary. Several
artifact/inventory/license reads separately checked and reopened a pathname.
The follow-up removes those split content/hash reads, pins regular-file identity,
uses nonblocking/no-follow opens and an initial-size-plus-one sentinel bound.
Runtime manifests are hashed and parsed from one snapshot; full package
verification checks that snapshot against the artifact's expected digest.

Documentation link reads now use the existing pinned bounded reader and
canonical repository containment. Generated output uses an exclusive temporary
descriptor, preserves existing mode with descriptor chmod, and atomically
renames; a restrictive-umask regression verifies mode preservation. Package
optional-dependency keys reject special object names/non-string versions and
use null-prototype dictionaries. Targeted tests cover FIFO rejection, zero-byte
growth, manifest tampering, dependency keys and documentation permissions.
Trusted/stable ancestor directories remain assumed: this is not an immutable
artifact tree or protection against hostile same-UID directory replacement.

### SR-15 — Eval grading accepts lookalike documentation links

Severity: Low, evaluation integrity. An unanchored substring check accepted a
model-doc pathname on an unrelated host. Grading now parses complete URLs,
requires the official HTTPS hostname/model path and rejects credentials or
nondefault ports. Markdown, query/hash, default HTTPS port and a trailing slash
remain supported. Positive/negative regressions passed; this check never made
a network request.

## Historical scanner review coverage

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
  profile/settings/report read hardening is implemented above.

## Verification and release

Unused-workspace cleanup removed `app-training` and `cloud-shared`. The latter
is omitted only from the unused SDK cloud-UI dependency boundary, with Nub
resolution and real leaf-UI build evidence. Remaining compatibility packages
expose only consumed registry JSON, worker error functions, or remote-message
types; empty runtime entry points were removed. Deleted tracked files remain
recoverable from Git history.

Integrated `check:all` on `8f8f5411` passed lint/types/agent build and 7,011 tests
(8 skipped). The release tail on the docs/Knip-only `0c631e9d` passed acceptance,
all-severity advisory policy, runtime preparation, and manifest audit (316
bundled package versions and four native package versions). This is staged
coverage, not a single fresh `check:release` invocation. The agent workspace
allowlists the OS `mkfifo` binary used for Unix named-pipe fixtures without
excluding those tests.

Native macOS directory packaging on `56581eaa` verified a 29.5 MiB `app.asar`,
16 packaged modules, 472 complete artifact dependencies, and four native runtime
packages. The isolated offline packaged test passed startup, privileged bridge,
terminal interaction and offline chat. Its focus-style assertions now poll a
single complete focused-state snapshot instead of sampling mid-transition.
This does not certify live providers or the user's existing account state.

PR37 was normally merged to `bde54f4d` after CI and its changed-code CodeQL
quality check passed. A fresh merged-main `check:release` passed 7,016 tests
(eight skips), acceptance, runtime preparation and dependency policy. The
rebuilt macOS package passed its isolated offline smoke test and was installed
with an ad-hoc signature; installed archive identity and native launch readiness
were verified. The prior app copy is retained separately for local rollback.

The subsequent **full-main** JavaScript analysis `1933399914` reports 189
results, including the 53 individually dispositioned PR results. It therefore
exposed 136 additional open identities outside the changed-code receipt.
Another 119 individually verified findings were dispositioned with GitHub
evidence; 17 remained open for the follow-up fixes above. No rule was disabled,
path excluded, severity downgraded or merge requirement overridden. Scanner
result/disposition counts are not counts of repaired vulnerabilities.

Pending for this follow-up: fresh integrated release validation, new-head
CodeQL review, normal merge and rebuilt-main installation. Seven version-based
dependency advisories remain visible despite reviewed mechanism patches;
Dependabot #4 is not hidden. Native Windows, hostile same-UID ancestor mutation,
live provider behavior and a live 50-agent workload remain unverified.

