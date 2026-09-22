# Coding harness repair — 2026-09-22

Status: repairs and repository verification completed; live acceptance is
partial. The original blog task is blocked on confirmation of its absolute
target directory. This is not yet a certification of the complete coding demo.

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
  envelopes now mark the turn failed.
- `874cbb0f`: keep the explicit offline-bootstrap test mode independent of
  Ollama availability. All 14 provider-handler regressions passed.
- `81824191`: the live read-only smoke test exposed a false mutation obligation:
  "Do not create, edit, delete..." was interpreted as a request for changes.
  Negated instructions and quoted examples no longer trigger that obligation;
  genuine mixed inspection-and-edit requests still do. 32 focused intent/routing
  tests passed, including the exact live prompt.
- `cd71b866`: nonterminal tool plans explicitly require native post-tool
  evaluation. A regression executes beta.7's installed completion gate against
  the exact live preamble; 29 focused tests passed. The precise historical
  termination branch remains an inference because raw planner/evaluator output
  was not captured. A desktop replay is still required.
- `44611c81`: intercept the actual promoted `TASKS_SPAWN_AGENT` action before
  the SDK injects its operation discriminator. Tests use the installed SDK's
  promoted action and verify selected model/effort at both spawn and send,
  awaited completion, and unchanged unrelated operations. 18 tests passed.

The integrated suite at `44611c81` passed **3,989 tests** across 911 files;
one opt-in Docker sandbox integration test was skipped. Root and desktop
typechecking, Biome, the agent build, and all repository acceptance checks passed.
Acceptance includes SDK alignment, plugin boundaries, documentation truth,
dependency hygiene and the critical production dependency audit.

## Live desktop and CLI checks

These checks used the installed application and its configured `codex` /
`gpt-5.6-luna` route. They were read-only checks in the existing `test` project,
not a substitute directory for the requested new blog.

| Check | Run / session | Observed result (UTC) |
| --- | --- | --- |
| Read-only inspection before classifier repair | `fb5d2a90-66cd-4abb-b01c-c4d24cfee4eb` / `desktop:383b2edd-fadd-48f7-9f3b-1a528ec1ecba` | 12:38:35–12:38:54; read the correct package.json, then incorrectly failed the mutation check. This prompted `81824191`. |
| Background shell, marker C | `8732bbdd-5943-43e6-ac33-8285f4bab08d` / `desktop:762f3629-7751-4170-a653-40872cef0332` | 12:41:31–12:42:09; `pwd; sleep 20; printf ...` continued after opening Settings, then returned `/Users/symbiex/dev/austin/test` and the correct marker. |
| Concurrent independent chat, marker D | `a4195a6d-1283-4587-bfb9-d66178721deb` / `desktop:90c07bb9-e516-4a15-8d3f-cf6150261e3d` | 12:41:53–12:41:56, overlapping C; returned 133 and only its own marker. |
| Retry and Stop | `78bdf633-b503-4963-bee3-1aa92ef96549` / `fork:91e99cf0-88e5-4591-ad2c-c80d92d6f622` | 12:42:43–12:42:58; Retry created a separate branch. Stop cancelled that running shell, preserving the original completed C and D runs. |
| Global CLI from HOME, isolated test data | `fde09bff-8c35-4c99-a1c2-f83023b43322` / `cli:932f9df2-647f-4530-aa3f-7471be7ed6ee` | 12:27:27; startup survived offline Ollama, `/model` reported actual unavailability, and a text request failed actionably in 23 ms. EOF shut down services and exited 0. |

Further live checks on `81824191` found two additional acceptance failures:

- `73727cf3-b593-40c5-9af7-5c50588eb1b4` (12:49:08–12:49:50) no longer
  falsely required mutation, but was marked complete after listing the workspace
  and reading only package.json. Its final answer was a promise to read the
  remaining files, not the requested summary. The SDK quick/multistep options
  passed by Doolittle are ignored by beta.7's v5 path; they do not prove the
  displayed iteration cap is enforced. The planner's eager completion gate
  permits a pre-tool acknowledgement to become final when `completed` is absent.
- `2d61bebd-2fc2-4477-a9bc-57fbb8e6c58e` (12:49:36–12:50:06) exposed a
  production registration gap: the SDK promotes `TASKS` into
  `TASKS_SPAWN_AGENT`, while the initial repair wrapped only the parent action.
  The live promoted action still returned detached `ready` with
  `continueChain: false`. Child `941df279-6637-46ff-a25a-1f2ec495ba8e` used the
  intended existing directory but inherited `gpt-6-astra`, not the selected
  `gpt-5.6-luna`; its SDK record later contained HTTP 400 requiring a newer Codex
  version. The parent instead displayed generic account-rebinding advice and
  was marked complete. Parent-action-only tests had missed this production path.

The desktop receipts contain ordered run/tool events and one final assistant
message per turn, without the earlier evaluator JSON or duplicate reply. These
short live provider responses were delivered in a **single terminal text frame**;
incremental prose streaming is not certified by these checks.

Source inspection locates that gap at the structured-output boundary: Eliza's
stage-one call requires `HANDLE_RESPONSE`, where prose is a function argument.
The official Codex backend buffers function-argument deltas and only exposes
text-output deltas through `onTextDelta`; Doolittle's `codex-reasoning` wrapper
inherits that distinction. The canonical answer therefore reaches chat during
post-provider finalization. A safe repair needs an attributed assistant-output
channel that distinguishes interim commentary from terminal prose. Re-enabling
provisional acknowledgements or streaming planner/evaluator JSON would revive
the original corruption. Incremental assistant prose on this configured route
remains unimplemented; the mechanism is source-verified, not inferred from a
complete raw provider payload capture.

The earlier packaged release at `81824191` passed both desktop end-to-end tests: offline
chat with the packaged bridge/terminal, and the 27-route control/theme/responsive
sweep (3.1 minutes). This offline suite does not replace live coding acceptance.
Packaging, installation, and live replay of the two newest fixes remain pending.

## Acceptance checklist

- [ ] Exact absolute target confirmed; unrelated files preserved.
- [ ] Original task submitted through desktop using configured provider.
- [ ] Doolittle creates the Next.js blog and real shadcn components.
- [ ] Bun installs dependencies and `bun run dev` works. Next.js owns the bundler.
- [ ] Production build succeeds; rendered page checked in a browser.
- [ ] Real URL and managed process exposed, with a working stop path.
- [x] Settings navigation preserves a demonstrably active run.
- [x] Concurrent same-workspace chats preserve independent messages and runs.
- [x] Stop and retry target only their run.
- [x] Required repository gates and packaged-desktop checks pass.
- [ ] Updated app installed locally; scoped commits pushed.
- [x] Global `doolittle` CLI opens without an unavailable embedding service
  crashing startup.

The unresolved original target is either
`/Users/symbiex/dev/austin/this-is-a-test` or the literal word-order path
`/Users/symbiex/austin/dev/this-is-a-test`. Neither existed on inspection. The
user was asked to confirm the intended absolute path; neither was created and
the original coding task has not been resubmitted. Consequently the blog,
shadcn/Bun implementation, production build, browser rendering and real generated
application handoff remain unverified. Bun is the package/script runner here;
Next.js supplies its supported development bundler.

Current scope limitation: concurrent chats in one active workspace are supported;
switching the global workspace during active work is explicitly blocked. This is
not a claim of cross-workspace parallel coding support.

Additional limitations: the SDK cannot cancel native adapter initialization
before a session handle exists. Startup requests are bounded, and an aborted
initialization never receives the coding task. The official account pool retains
its configured selection strategy; same provider/model is enforced, not an
unverified guarantee of the same pooled account. Windows process termination
has not been tested on this macOS host.
