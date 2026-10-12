# Shared agent engine

The desktop keeps one lead OS backend process. When a named bot is needed, that
process starts a Node worker thread with its own ElizaOS `AgentRuntime`; it does
not switch one mutable runtime between characters. The existing bot catalog,
profiles, run ownership, and conversation records remain authoritative. A named
bot becomes available on demand through `backendFor`. A stopped named bot's
composer accepts a draft when the lead host and run recovery are ready; the
first send uses native conversation ownership and grant checks before starting
that bot. Opening a conversation or polling the catalog does not start its
worker. The bot-card **Start now** optionally warms it early, while **Stop work**
stops its active worker without disabling or archiving its saved profile. A
failed or already-starting bot still requires recovery before another dispatch.
Creating a bot warms only the newly saved worker after its first chat is bound.
Model/account errors remain visible; readiness is never fabricated.
Up to 64 workers may be resident, with at most two
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

Chat IPC reserves an authorized sender/bot/request binding before waiting for a
cold worker. Stopping that pending request prevents its later POST without
stopping a shared bootstrap that another request may need. Stop during an
in-flight submission waits at most 15 seconds for its receipt; an unconfirmed
outcome retains the request and queues cancellation for a later valid receipt.
Failed server cancellation keeps the stream and ownership claim available for
retry rather than manufacturing a cancelled event. Existing stream recovery
still reports unrecoverable stream failures as errors; a transport failure
alone does not prove that provider work stopped.
Recovered runs release a matching ownership claim only after a terminal run
receipt is confirmed, including when the final stream event was lost. Cancelling
a recovered run never activates a stopped worker.

Opening a terminal requires a confirmed bot/session/project grant. A human
opening the initial fresh General draft first binds it to host-owned private
scratch; persisted draft intent never supplies a root. The new-chat
chooser creates that binding. Historical rootless chats cannot infer one from
today's open folder. A cancellable presentation intent prevents a late
binding response from reopening a panel after navigation or close. Terminal
creation uses one timestamped request identity per tab, retained across uncertain
replies and reloads. The runtime rejects conflicting, retired, or expired
identities instead of creating another shell; its bounded identity table never
evicts an unexpired receipt to make room. Creation reconciliation is restricted
to the same boot instance and current grants. Its 20-second HTTP budget follows
initial worker activation, which retains the separate bootstrap limits above.
Read-only identity probes make at most three attempts within that existing
budget, retrying only known socket failures or timeouts and rechecking readiness.

Terminal output carries the responding runtime's boot identity. Only a matching,
authorized missing-session receipt proves absence; transport errors preserve
the session and permit bounded read-only recovery. Recovery never activates a
stopped bot, and typed input, interrupt, and close are not automatically replayed.
An operator may explicitly discard an uncertain tab after a warning: this removes
only its view/recovery identity, not a possibly-running shell. **Stop work** or
quitting Doolittle is the separate shutdown action. These receipts handle lost
responses; they do not establish the underlying socket-reset trigger.

Each worker receives a distinct environment, bot profile, settings, private
startup workspace, account grant, and data directory (including its SQL state).
Execution roots belong to immutable, host-owned chat grants. A project chat
requires explicit native confirmation; private general chats do not acquire
the current repository. Async request-local scope lets one bot serve different
projects without mutating the worker's startup root. Workspace, terminal, ACP,
skills and project context resolve that scope; legacy rootless chats fail closed
for effects while keeping history readable. Node worker
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
Lead Work tasks freeze the chat's root and project in their SDK task receipt.
Creation cannot silently grant a sibling worktree; it needs its own approved
chat. Execute, retry, child creation, and lifecycle mutations revalidate the
original grant and current chat before invoking SDK effects. Historical tasks
without that witness need to be recreated from an approved chat.
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
