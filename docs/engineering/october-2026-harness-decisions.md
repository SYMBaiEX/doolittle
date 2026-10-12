# October 2026 harness decisions

Reviewed 2026-10-11. This is an implementation decision note, not a release
certification. All three priorities have scoped local implementations and
focused regressions. Broad architectural extraction remains future work, not
a claim that the entire existing completion decision tree was replaced.
Scope: the native chat turn, SDK planner boundary, runtime service adapters,
planner tool advertisement, context compaction, and their existing regressions.

## Keep one execution spine

```text
CLI / desktop / gateway
  -> native/provider-stage.ts
  -> runProviderModelTurn: session continuity + request-local runtime scope
  -> executeProviderMessageTurn: Doolittle continuation/completion policy
  -> Eliza DefaultMessageService.handleMessage
  -> native Stage1 + planner + actions + post-tool assessment
  -> ordered action receipts -> post-provider finalization -> surfaces
```

Eliza owns planning and action dispatch. Doolittle owns transport/UI, selected
provider settings, cancellation propagation, managed application behavior, and
receipt-backed product completion. Service bridges adapt registered services;
they must not become a second agent loop or separate source of task status.

Evidence: [native provider stage](../../packages/agent/src/runtime/chat-turn/native/provider-stage.ts),
[provider turn](../../packages/agent/src/runtime/chat-turn/provider.ts),
[provider handler](../../packages/agent/src/runtime/chat-turn/provider-handler.ts),
[request-local scope](../../packages/agent/src/runtime/turn-runtime-scope.ts),
[service resolution](../../packages/agent/src/runtime/native/service-bridge/runtime.ts),
and [planner completion compatibility](../../packages/plugins/doolittle-plugin/planner-completion.ts).

## Three implementation priorities

### 1. One request-local coordinator for continuation, budget and cancellation

Confirmed: `provider-handler.ts` permits twelve outer mutation-continuation
passes and separately evaluates no-action stalls, approvals, delegation
failure, frontend review, explicit incompleteness and completion receipts.
`native/setup.ts` raises mutating requests to at least 45 `maxIterations`, but
the handler explicitly documents that beta.7 ignores the legacy iteration and
one-action-yield hints. An SDK message pass can execute multiple tools.

Smallest intervention: keep the SDK inner planner and existing receipt helpers.
Extract the outer continuation decision and request-local budget into one
coordinator, carried through `turn-runtime-scope.ts`. Charge it across every
outer pass and nested adapter settings, not anew per `handleMessage` call.
Abort, pending approval and concrete execution failure take precedence over
continuation; verified completion takes precedence over provisional prose.
Exhaustion preserves edits and receipts and reports incomplete work, not success.
Count model admissions explicitly if that is the enforced budget; do not call
that count a tool-call or token limit. Keep distinct unit names in telemetry.

Implemented: a request-local `TurnPlannerBudget` in `turn-runtime-scope.ts`
shares the tool allowance across native passes and additional settings scopes.
It counts SDK pending-tool envelopes, conservatively reconciles returned actions,
and shrinks each next native pass's ceiling. Existing chronological completion,
approval and failure policies remain authoritative. Verified terminal receipts
win at the exact budget boundary. The large outer decision tree remains a
maintenance concern; this change does not introduce or certify a new coordinator.

Gain: one truthful stopping authority and bounded recovery cost, with less risk
of repeating already-completed work. Cost: a small state object and focused
regressions; no new planner, persistence store or generalized workflow engine.
Owner/task: runtime harness coordinator; CLI owner separately wires process
interrupts to the same turn signal and truthful failure exit status.

Validate: normal inspect/edit/verify completion; budget exhaustion after partial
edits; concurrent sessions with nested delegation and cancellation affecting
only the selected turn. Preserve chronological receipt invalidation.

### 2. Reuse SDK compaction and enforceable loop configuration

Confirmed in installed `@elizaos/core@2.0.3-beta.7`,
`dist/node/index.node.js`: `DEFAULT_CHAINING_LOOP_CONFIG` includes tool/repeat
limits and enabled compaction. `callPlanner` budgets rendered messages,
prompt segments **and tools**, then invokes `maybeCompactPlannerTrajectory`.
The public `runV5MessageRuntimeStage1` accepts `plannerLoopConfig`; the installed
message service does not forward that option. A low `maxToolCalls` throws
`TrajectoryLimitExceeded` rather than yielding a normal completed turn.
These are installed-source facts, not live-provider measurements.

Smallest intervention: use the installed SDK budget/compaction contracts with
the selected model context limit and reserved output space. If configuration
must cross `handleMessage`, use a narrowly pinned compatibility patch with
actual installed ESM/CJS coverage, rather than bypassing the message service.
Carry remaining limits across outer passes. Until that forwarding exists,
accurately describe which coordinator limits are enforced and which SDK limits
remain defaults. Do not add a second summary model or silently truncate tool
results. Doolittle-owned model prompts continue through `runtime/prompt-cache`.

Implemented: the narrow pinned core patch forwards the public planner config
through `handleMessage` in node/browser bundles and the TypeScript contract.
Doolittle passes the selected model name to SDK context policy, keeps SDK
compaction enabled and supplies the remaining tool ceiling. Native trajectory
limit failures retain an explicit diagnostic instead of masquerading as provider
unavailability. Installed-runtime fixtures cover success and limit refusal; a
live long-session compaction benchmark is not part of this delivery.

Gain: prevent context overload without competing summaries or losing stable
cache prefixes. Cost: model-limit mapping and possibly a small temporary SDK
patch; unknown model limits and oversized retained evidence remain explicit.
Owner/task: runtime SDK boundary/context policy. Retire compatibility patches
only when an upstream release passes the same installed-runtime regressions.

Validate: an ordinary planner input remains unchanged; a tool-heavy input
triggers SDK compaction with correlated call/result parts intact; unknown model
limits and limit exhaustion fail truthfully without certifying completion.
Starting coverage: `SDK yield` (historical coverage, retired with the legacy suite),
`tool-size boundary` (historical coverage, retired with the legacy suite),
`terminal preservation` (historical coverage, retired with the legacy suite),
and `web source preservation` (historical coverage, retired with the legacy suite).

### 3. Canonical tool advertisement, unchanged SDK admission

Confirmed: [planner-tool-exposure.ts](../../packages/agent/src/runtime/native/plugin-registry/planner-tool-exposure.ts)
supplies a `pre_model` hook. It removes only demonstrably
duplicate aliases, preserves canonical/terminal names, and leaves ambiguous or
unreadable registries unchanged. It is registered by `providers.ts` and now
enabled by default. `DOOLITTLE_PLANNER_DEDUP_ALIAS_TOOLS=false` restores the
original advertisement; unrecognized explicit values disable the optional
optimization. Injected `enabled` options retain precedence.

Implemented intervention: enable the existing canonical advertisement policy
with an explicit rollback setting and require the installed SDK's exact derived
alias description as well as shared schema identity. This retains separately
authored tools with intentionally distinct routing descriptions. Do not
rewrite schemas, rename registered actions, remove permission checks, or use
advertisement as authorization. Defer more aggressive dynamic tool selection
until actual tool-byte/context observations justify it.

Gain: reduce repeated schema/context cost and selection ambiguity without
changing action semantics. Cost: conservative filtering misses some potential
savings. Owner/task: runtime tool exposure; keep plugin/service ownership and
legacy dispatch compatible. Reduced advertisement is not a proven speedup.

Validate: canonical action dispatch; denied/failed action remains denied/failed;
shared aliases, schema collisions and promoted subactions retain admission
behavior. Starting coverage: `exposure tests` (historical coverage, retired with the legacy suite)
and `actual SDK subplanner payload` (historical coverage, retired with the legacy suite).

Focused verification: one `nubx vitest run` invocation passed both immediate
test files, 65 tests. Coverage includes default/rollback through the installed
SDK and real Codex tool translation, canonical and removed-legacy dispatch,
role/context refusals, invalid arguments, handler failures, distinct descriptions,
collisions and unreadable/frozen inputs. The synthetic fixture reduced advertised
tools from 10 to 6 and translated payload characters from 7,756 to 3,693; this is
synthetic serialization evidence, not a live latency or provider result.

## Bounded primary-source comparison

Sources refreshed 2026-10-11. These are design patterns to reuse, not benchmark
rankings, claims of feature parity, or proposals to replace ElizaOS.

| Harness | Verified architectural pattern | Doolittle decision |
| --- | --- | --- |
| [OpenCode agents](https://opencode.ai/docs/agents/) | Primary/subagent roles, permission-scoped tools, explicit iteration ceiling with a remaining-work summary. | One coordinator; exhaustion is not completion; tool advertisement is separate from permission. |
| [Codex agent loop](https://openai.com/index/unrolling-the-codex-agent-loop/) | Model/tool iterations share one turn; context management and stable prompt-prefix caching belong to the harness. | Reuse SDK planner/context handling and Doolittle's existing prompt-cache contract. |
| [Claude Code architecture](https://code.claude.com/docs/en/how-claude-code-works) | Gather/action/verify loop; tool-output clearing and summarization; isolated subagent context; interruptions remain part of the loop. | Parent retains scoped receipts and cancellation, rather than replaying child transcripts into a second planner. |
| [Gemini CLI core](https://geminicli.com/docs/core/) | CLI UI is separate from core tool orchestration/session state; core compresses approaching-limit history. | Keep UI a projection of the same run and SDK execution spine. |
| [OpenHands agent](https://docs.openhands.dev/sdk/arch/agent) and [events](https://docs.openhands.dev/sdk/arch/events) | Explicit reasoning/action steps, typed events, pending confirmation and optional condensation. | Use explicit state/reason enums at the outer boundary; preserve SDK action/observation evidence. |
| [Aider repo map](https://aider.chat/docs/repomap.html) and [modes](https://aider.chat/docs/usage/modes.html) | Relevant repository context selected under a token budget; architect/editor split is a distinct mode. | Bound context before adding orchestration; don't make a second planner mandatory for ordinary edits. |

For OpenAI, available local Doolittle Codex adapter/provider code was inspected
first; no local Codex Rust source checkout was found in the bounded workspace
scan. The architectural comparison therefore uses OpenAI's official engineering
article, not third-party reconstructions. OpenCode's stable agents page is used;
its separate v2 development documentation is not treated as the same contract.

## Critical dependency security boundary

The production graph resolved Handlebars 4.7.9 through Eliza core's declared
`^4.7.8` dependency. Both maintainer advisories,
[AST type confusion](https://github.com/handlebars-lang/handlebars.js/security/advisories/GHSA-8r5x-fm3f-whwj)
and [own-property bypass](https://github.com/handlebars-lang/handlebars.js/security/advisories/GHSA-p8wg-vrv2-v86f),
identify [4.7.10](https://github.com/handlebars-lang/handlebars.js/releases/tag/v4.7.10)
as fixed. A dependency override alone would not replace the vulnerable compiler
embedded in the published SDK bundles.

The pinned core patch now imports the declared external Handlebars dependency
in node, browser and edge bundles and redirects both compiler bindings to it.
Old embedded definitions remain in source; their former bindings no longer
invoke them. Forward application against the pristine npm package and reverse
application against the installed package passed. An installed 4.7.10 smoke
intercepted six external compiler calls: prompt rendering and the actual runtime
template compiler in each bundle. Four ordinary template fixtures retained
4.7.9/4.7.10 output parity; malformed templates and malformed AST were rejected.
This verifies the executing dependency boundary, not arbitrary plugin safety
or a claim that old source bytes were removed. The inspected prompt call sites
use string transformations and default options; exploit reachability there was
not established. Lockfile/audit and packaged installation checks are separate
release-owner gates. Retire the patch when the SDK ships the fixed dependency
without an independently vulnerable embedded compiler.

## Verification and residual risk

This work checked source paths, installed SDK behavior and 65 focused planner
advertisement regressions; it did not run the full suite, a provider, desktop pixels or a
deployment. Historical [coding repair evidence](../coding-harness-verification-2026-09-22.md)
and [coding eval contracts](coding-task-evals.md) were read for boundary context,
not presented as current acceptance.

Runtime follow-up added 14 selected SDK/scope/receipt checks and 45 selected
intent/product-seam checks. Real product dogfood exposed a read-only diagnosis
misclassified as a mutation; the exact request now completes after one file
read. See [the overhaul record](october-2026-overhaul.md) for release and live
evidence. Canonical exposure is independently reversible. Long-session latency,
saturated delegation and cross-platform behavior remain unverified.
