# Shared agent engine

The desktop keeps one lead OS backend process. When a named bot is needed, that
process starts a Node worker thread with its own ElizaOS `AgentRuntime`; it does
not switch one mutable runtime between characters. The existing bot catalog,
profiles, run ownership, and conversation records remain authoritative. A named
bot becomes available on demand through `backendFor`; the bot-card **Start now**
warms it early, while **Stop work** stops its active worker without disabling or
archiving its saved profile. Up to 64 workers may be resident, with at most two
bootstraps in progress at once. Each currently has an internal loopback API
listener; this is not yet one shared HTTP listener, database, or model pool.

A start request may wait in the host's bootstrap queue before its worker's
45-second boot timer begins. Desktop start controls therefore use a bounded
fleet deadline derived from 64 sequential boot windows plus one IPC window;
stop controls retain their separate 45-second deadline. **Stop work** sends an
addressed stop immediately, including for a queued or booting bot, and only
releases its host binding after the host confirms the stop. The fleet deadline
uses production host defaults; custom programmatic boot-timeout overrides are
not covered by that calculation.

Each worker receives a distinct environment, bot profile, settings, workspace
grant, account grant, and data directory (including its SQL state). Node worker
isolation is **not** an OS security sandbox: a fatal native crash can affect the
shared process. The host still validates bot identity and grants, and workers
must not inherit the lead's credentials or home directory. See
`apps/desktop/src/main/bot-process-registry.ts`,
`apps/desktop/src/main/engine-bot-backend.ts`, and
`packages/agent/src/runtime/engine/host.ts` for the ownership boundaries.

## Execution admission

The desktop main process owns a fair, per-bot waiting queue. Its defaults are:

| Boundary | Default |
| --- | --- |
| Active executions across the fleet | `min(availableParallelism(), 12)` |
| Active executions per bot | 2 |
| Automatic ACP executions | `max(1, floor(fleet limit / 2))` (6 when fleet limit is 12) |
| Waiting executions | 512 total, 16 per bot |
| Queue wait timeout | 45 seconds |

The main process alone can set `DOOLITTLE_ENGINE_MAX_EXECUTIONS`,
`DOOLITTLE_ENGINE_MAX_AUTOMATIC_ACP`, `DOOLITTLE_ENGINE_MAX_EXECUTIONS_PER_BOT`,
`DOOLITTLE_ENGINE_MAX_PENDING`, `DOOLITTLE_ENGINE_MAX_PENDING_PER_BOT`, and
`DOOLITTLE_ENGINE_QUEUE_TIMEOUT_MS`. Values must be positive integers and pass
the admission constructor's range and cross-limit checks; invalid capacity
configuration fails closed. The host serializes overlapping mutation-capable
workspace runs. When a managed lead ACP child or approved bot consultation is
awaited, the parent yields its execution seat and reacquires it before
continuing. See `apps/desktop/src/main/execution-capacity.ts`,
`apps/desktop/src/main/execution-admission.ts`, and
`packages/agent/src/runtime/execution-admission.ts`.

Accepted chat runs are queryable and cancellable while waiting for admission:
the server records a waiting receipt before returning `202`, without storing
the queued prompt or claiming that model execution has started. Admission then
transitions that exact receipt into the SDK turn. Cancellation and admission
failure retain terminal receipts even if no SDK turn begins.

Named bots can consult approved persistent bots via `DOOLITTLE_CONSULT_BOT`.
That path checks permissions and lineage, caps consultation depth at 2 and
consultations per root run at 3, and yields the parent seat while waiting.
The SDK ACP coding-agent orchestrator remains disabled for named bots: the
worker's approved native Codex/Claude grants are not automatically provisioned
to SDK coding CLIs, and the SDK's spawn defaults do not enforce a named bot's
adapter, workspace, and tool grant. The lead's managed ACP path is admitted.
Do not describe consultations as unrestricted coding subagents. Provider RPM,
model quotas, and all SDK background task jobs are not blanket-admitted by the
API-turn queue.

## Verification and limits

The 50-worker check uses tiny real Node workers: it demonstrates one PID,
separate worker environments and thread IDs, and bounded bootstrap concurrency,
**not** 50 loaded SDK runtimes. A separate 50-bot test exercises the synthetic
fair queue. The opt-in shared-engine E2E boots two actual offline SDK bots in
one process, exercises independent turns and stop/restart, and makes no paid
provider calls. These checks do not establish zero bottlenecks, live provider
capacity, OS-level containment, or full security clearance. Run the focused
checks using the commands in [fast development](fast-development.md); report
which tests ran versus skipped.
