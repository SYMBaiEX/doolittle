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
  Add bot, Team & work, Connections and Settings are supporting destinations.
- One 48px conversation header carries bot identity, thread title, inspector and
  overflow. New/close view actions are disclosures. Closing a view never stops work.
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

Drafts, stream subscriptions, queued messages, editor documents and PTYs belong
outside replaceable presentation. Running, Waiting, Attention, Complete, Stopped,
Error and Offline are execution facts, never guesses based on visibility. A
presentation switch does not resend, cancel or complete a run.

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
