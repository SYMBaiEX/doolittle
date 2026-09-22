# Coding harness repair — 2026-09-22

Status: implementation and acceptance verification in progress. This document
does not certify the desktop workflow until the acceptance results below are
filled in.

## Observed failure

The latest failed desktop coding request was recorded once, in General chat,
without attachments or a project association. Its provider was `codex`, model
`gpt-5.6-luna`, reasoning effort `medium`.

| Evidence | Identity / time (UTC) |
| --- | --- |
| Conversation | `desktop:31232f25-b424-4929-b2ab-352fc6489968` |
| Run | `09dfae49-70bc-4583-9d92-57e2b1198c1b` |
| Canonical user message | `044f053c-0b24-47a8-a9f7-b90f0596f421`, 11:50:36.017 |
| Run start | 11:50:36.020 |
| Only observed action | `TASKS_SPAWN_AGENT`, 11:51:07.202 |
| Coding child | `6f7176c5-6ca1-40fa-b8d5-3f3fa6c087a8` |
| Spawn returned ready | 11:51:12.273 |
| Run failure | 11:51:17.132 |
| Canonical assistant | `a2f42715-6dff-44f3-989b-7d24352b4852`, 11:51:17.130 |

Local evidence sources were the desktop runtime's `state.db`,
`run-receipts.json`, and `trajectories/trajectory-events.jsonl`, plus the
official ACP store at `~/.eliza/plugin-acp/sessions.json`. No credentials or
complete provider prompts are included here. The runtime remained healthy;
the on-disk process-error logs had no September 22 entry. The SDK trajectory
export for this time window returned an empty array, so full archived model
requests/responses are not available for this historical turn.

The receipt recorded zero local mutations. Neither candidate new-app directory
existed on initial inspection. The child store records `Authentication required`
and an errored Claude session, despite the parent using Codex. Its last-activity
timestamp was updated later; it is not proof of the exact authentication-failure
time.

## Root causes

1. The official spawn action returned `success: true`, empty text and
   `continueChain: false` when the child session became ready. The actual coding
   task ran detached, outside the parent turn's completion and cancellation
   boundary.
2. The SDK's nonexistent-workdir fallback selected the desktop instead of
   rejecting the requested location. The planner also selected Claude without
   carrying the configured Codex route through delegation. Claude authentication
   then failed, without an actionable error reaching the original turn.
3. Post-turn memory evaluation inherited the assistant stream callback. Its
   tokenized JSON bypassed whole-envelope filtering and appeared in chat.
4. A failed optimistic assistant with different text from the canonical failure
   was retained. Its timestamp preceded the persisted user message by four
   milliseconds, producing a duplicate response above its own prompt.
5. The final mutation safeguard rejected the unfinished work, correctly avoiding
   a false success claim, but hid the concrete delegation failure behind generic
   receipt terminology.

## Repairs and regression evidence

- `990ef5ec`: SDK purpose-attributed stream filtering; legitimate assistant JSON
  and concurrent turn contexts remain supported. 37 focused tests passed.
- `4c191790`: reconcile failed and completed optimistic replies by their user
  turn, repair cached ordering, and retain one assistant activity card. 69 focused
  tests and the 1,377-test desktop suite passed.
- `9ab12730`: preserve verified delegation blockers in final completion,
  including failures after partial edits; allow later recovery. 15 post-provider
  tests passed.
- `973027cd`: await the real SDK coding task, carry the parent provider/model
  and effort, reject changed working directories, report child events, close the
  correct child on Stop, and fingerprint actual file changes. 21 focused tests
  passed, including the installed SDK action and same-runtime concurrent chats.
- `fbfcb6bf`: managed application start/status/stop using the existing terminal.
  Only an observed loopback URL with a successful HTTP probe is reported ready.
  45 focused tests passed, including a real HTTP process surviving workspace
  navigation and terminating on Stop/shutdown. Silent terminal exits and
  accidental shell restart after stopping an App tab were repaired too.
- `3e177979`: optional Ollama embeddings no longer crash CLI startup. `/model`
  checks actual readiness; explicit data-directory overrides also isolate PGlite;
  CLI EOF shuts down services. 35 focused tests and an actual HOME-launcher test
  passed. No existing database or credentials were moved or changed.
- `db6c49a7`: offline Ollama preflight prevents the SDK from replacing an
  actionable error with a canned successful reply. SDK-generated failure
  envelopes now mark the turn failed. 13 provider-handler tests passed.

The intermediate integrated suite passed 3,938 tests; one opt-in container
sandbox integration test was skipped. Typechecking, desktop typechecking,
Biome, the agent bundle, and repository acceptance checks passed. Final checks
after the last commits and desktop packaging remain pending below.

## Acceptance checklist

- [ ] Exact absolute target confirmed; unrelated files preserved.
- [ ] Original task submitted through desktop using configured provider.
- [ ] Doolittle creates the Next.js blog and real shadcn components.
- [ ] Bun installs dependencies and `bun run dev` works. Next.js owns the bundler.
- [ ] Production build succeeds; rendered page checked in a browser.
- [ ] Real URL and managed process exposed, with a working stop path.
- [ ] Settings navigation preserves a demonstrably active run.
- [ ] Concurrent same-workspace chats preserve independent messages and runs.
- [ ] Stop and retry target only their run.
- [ ] Required repository gates and packaged-desktop checks pass.
- [ ] Updated app installed locally; scoped commits pushed.
- [ ] Global `doolittle` CLI opens without an unavailable embedding service
  crashing startup.

Current scope limitation: concurrent chats in one active workspace are supported;
switching the global workspace during active work is explicitly blocked. This is
not a claim of cross-workspace parallel coding support.

Additional limitations: the SDK cannot cancel native adapter initialization
before a session handle exists. Startup requests are bounded, and an aborted
initialization never receives the coding task. The official account pool retains
its configured selection strategy; same provider/model is enforced, not an
unverified guarantee of the same pooled account. Windows process termination
has not been tested on this macOS host.
