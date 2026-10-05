# Doolittle companion interface

## Design direction

The default Companion composition is a contact-sidebar messenger: one readable
conversation, one compact composer, supporting tools on demand. Canvas hides
navigation until requested and gives conversations and supporting panes more room.
Both compositions use the same capabilities, session identities and host.

Keep Doolittle's small existing mark, restrained orange accent, warm neutral
light/dark surfaces, system/Avenir sans and monospace code. Conversation text is
16px/1.55; controls are 14px with 40px ordinary and 44px touch targets. Reading
width defaults to 760px, navigation to 248px and inspector to 320px. Compact
density reduces chrome without reducing transcript legibility. No decorative
gradients, glow, textures, or cards around ordinary lists.

## Hierarchy and workflows

- Navigation contains search, new conversation, bot contacts, and the selected
  bot's recent conversations. Selecting a bot resumes its latest conversation.
  Add bot, Team & work and Connections are supporting destinations.
- One 48px conversation header carries bot identity, thread title, an icon-only
  inspector toggle, adjacent Settings gear and overflow. Both icons have named
  tooltips and accessible labels. Settings lives in the header, not the sidebar.
  New/close view actions are disclosures. Closing a view never stops work.
- Tabs and arrangement tools appear only with multiple open conversations. The
  workspace supports nested right/below splits, resizing, reordering, focus and
  closing, with a 12-view limit. Narrow layouts show the active tab and retain
  the saved desktop arrangement; hidden panels remain mounted and inert.
- The composer contains text, Attach, model route and Send/Stop. Advanced
  actions live in Add. Queue, files, errors and memory matches appear when relevant.
  Context pressure is disclosed when warning/error thresholds matter, not as a
  permanent zero-usage meter. Full context remains available in Details.
- The initially closed inspector contains Details, Library and Computer.
  Computer opens actual editor/browser/terminal resources; it is not a VM.
  Its immutable bot/conversation/workspace origin must not follow ambient focus.
- Settings uses a fixed-width, independently scrolling, searchable section menu
  with every group always expanded. Selection uses a quiet current-section marker,
  never a route stripe or auto-collapsing group. One consistent section heading,
  readable field descriptions and rule-separated forms apply across retained pages.
  A native grouped section picker replaces the menu below 760px of available
  settings width. Section changes never resize or auto-collapse navigation.
  Interfaces, Desktop, Execution and Advanced have distinct persistent deep links.

Drafts, stream subscriptions, queued messages, editor documents and PTYs belong
outside replaceable presentation. Running, Waiting, Attention, Complete, Stopped,
Error and Offline are execution facts, never guesses based on visibility. A
presentation switch does not resend, cancel or complete a run.

## Persistent bots and knowledge

Bot contacts represent persistent workers, not cosmetic personalities. The
authoritative catalog stores stable IDs, personas, model routes, approved
connection references, workspace permissions and archive state. Sessions,
runs, approvals, artifacts and Computer resources retain immutable ownership.
The lead identity and existing conversations are adopted in place.

Specialist consultation uses bounded durable chat dispatch with visible
attribution, cycle checks and execution admission. Private history remains
private. Only explicitly promoted, provenance-bearing results enter shared
project/team knowledge through the broker-only official DocumentService worker.
Retrieval requires a current grant and current membership; revocation blocks
future retrieval but cannot erase information already delivered to a model.

Team membership is an explicit, revisioned host-owned catalog, not an inference
from projects. Manage teams in Team & work → Agents. A completed message's
bookmark action chooses its project or team; Memory → Shared knowledge manages
separate recipient grants. Team sharing may cross projects only for current
members. Ambiguous legacy document identities remain visible and fail closed;
re-promote the exact source rather than guessing or deleting old provenance.

The application-owned scheduler can target a named bot for scheduled or manual
prompt/run-agent turns. Native approval binds the saved job, bot configuration,
workspace and mutation permissions. Each fire has a persisted SDK idempotency
key and its own durable owned conversation; uncertain fires are not replayed
with new keys. Workers do not run their own schedulers or connector gateways.
Named automations currently reject webhooks, home delivery, runtime overrides
and lead-loaded skills. Application-owned external connector dispatch to named
bots remains unsupported: approved model accounts do not grant Gmail, Calendar
or other app access. Actual offline worker acceptance covers dispatch, result
ownership, restart deduplication and independent cancellation, not paid-provider
or external-connector execution.

The pinned SDK TaskService remains the scheduler. Its compatibility patch wakes
cached future jobs when due, preserves wake signals after adapter failures and
invalidates restored-job caches when the official trigger worker is registered.
No second timer or coordinator owns execution. Independent runtime queues may
progress concurrently; the SDK's sequential execution within one runtime is
retained, so a long scheduled fire may delay another job on that same runtime.
Wall-clock timing under saturated load is not established by a single-fire test.

Local draft project scope is captured at creation/navigation and persisted by
conversation ID. Saved native ownership takes precedence, including explicitly
unscoped sessions. Unknown legacy draft scope is not guessed from whichever
project currently has focus; keep its text and surface a recovery action.

## Reusable package and themes

Private `@doolittle/ui` owns controlled browser-safe controls and compositions.
Suitable official ElizaOS controls are explicit wrappers. Native select is used
for host-owned view selection. Fetching, credentials, runtime coordination,
Electron/preload, Monaco and xterm stay outside the package.

Theme manifest v2 is validated non-executable data: semantic colors, typography,
spacing, geometry, density, motion and registered Companion/Canvas presets.
Existing v1 themes migrate without resetting saved preferences. Layout presets
change composition, not runtime permissions or execution ownership.

## Optional interfaces

UI plugin manifest v1 declares compatibility, exact artifact identity,
registered contributions and requested capabilities. Installation and access
management remain native host responsibilities.

`UiHostV1` exposes revisioned snapshots, sequenced subscriptions, explicit owned
targets and stable submission IDs. Trusted prebuilt React entries export
`createRenderer(React, Ui)` and return a function component accepting
`{ host, presentation }`. Presentation metadata includes the exact artifact,
registered workspace/panel contributions and optional host-selected contribution.
Selecting a contribution updates presentation without creating another coordinator.

Trusted renderers require full-application-trust consent for their exact version
and digest. They are **not sandboxed**. Community static assets use a private,
isolated Electron WebContentsView with restrictive CSP/network policy and only
`window.doolittleUI`: host snapshot/dispatch/subscription plus public presentation
metadata/events. They do not receive the privileged desktop preload or Node.
The native host validates contribution selection against the verified manifest;
community code cannot select an unregistered view or grant itself capabilities.

Reading, sending, stopping, attachment picking and host-surface opening are
separate grants for explicit conversations. Consent explains that authorized
plugin code can initiate agent actions. Ownership and grant generation are
checked again before effects commit; scope changes revoke pending operations.
Background community commands are disabled. Host tools temporarily cover the
same community view; Back returns without remounting it. Protected dialogs hide
the community view. Approval, installation, grants, Stop all, Restore default
and startup safe mode remain host-owned.

The optional AG-UI adapter projects Doolittle's durable text/lifecycle stream,
owned cancellation, approval presentation and custom events. Reconnect resumes
observation from a sequence cursor without resubmission. Client-supplied tools,
state, arbitrary context and interrupt/branch continuation are explicitly rejected;
approval decisions remain host-owned. CopilotKit and hosted Intelligence are not
dependencies or a second execution coordinator.

## Accessibility and validation

Keyboard navigation must reach every retained route and action. Tabs use roving
focus and arrows/Home/End; resizers have names and keyboard adjustment. Dialogs
trap focus, close on Escape and restore their trigger. Hidden panes are inert.
Streaming does not steal focus. Errors stay actionable, disabled states explain
their prerequisite, and loading retains usable controls. Reduced motion removes
nonessential transitions. Normal text needs 4.5:1 contrast; selection and state
must not rely only on color.

Validate actual Electron workflows at 360, 768, 1280 and 1728 CSS pixels,
including parallel sessions, keyboard-only interactions, both interface tiers,
grant races, recovery and VoiceOver traversal. Source tests and builds are not
proof of packaged behavior, assistive-technology behavior or agent quality.
Record final verification and installation evidence separately from this design
contract; never turn an untested capability into a passing claim.
