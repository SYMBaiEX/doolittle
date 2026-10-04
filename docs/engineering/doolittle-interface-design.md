# Doolittle operator workbench

## Direction and boundaries

Preserve `brand.md`: warm near-black or warm light surfaces, Doolittle orange,
Avenir/system sans for prose, system monospace for commands, paths, state and
identifiers. The interface is a local operator workbench, not a marketing page.
Use solid panel edges to communicate ownership, selected leading edges to
communicate context, and a one-pixel contact lip on action keys. Do not add
gradients, neon glow, decorative runtime indicators, remote fonts or new UI
dependencies. Keep SDK controls and the existing Tailwind-only presentation
contracts; visual changes must not fabricate agent capabilities.

Comfortable density is the readable default: 14px prose, 13px controls, 12px
metadata, 36px ordinary controls. Compact is 14px prose, 12px controls, 11px
metadata and 32px controls. Narrow touch controls have a 44px target. Compact
reduces spacing and chrome, not transcript legibility. Radius roles are 3px
keys, 5px sections, 8px composition surfaces, 10–12px overlays.

## Concrete audit and screen decisions

The pre-change Electron captures at 1440×960 and 390×844 show a centered
three-card launch view, very small top/sidebar chrome, a settings-route gradient
and weak visible boundaries. The implementation replaces the starter cards with
an ordered command console, gives the shell a monospace operator masthead,
normalizes literal 10–11px layout text through density tokens, removes decorative
gradients/glow, and uses a contrast-protected keyboard ring.

| Surface | Composition and primary action | Secondary information |
| --- | --- | --- |
| Application shell | Product masthead; New conversation key; Chat/Code modes; project/history rail | Search shortcut, scope, runtime health and settings stay subordinate |
| Chat workbench | Each open conversation owns its own bounded transcript and composer | Identity, project and run state belong to the session; provider/model selection is a shared runtime route |
| New conversation | Left-aligned `~/doolittle $ new session` marker, task heading, three numbered prompt rows | Prompt choices populate the composer; they do not execute automatically |
| Coding | Explorer, editor and terminal remain real separated tool surfaces | Utility tabs are content navigation, not additional primary actions |
| History | Searchable master list with selected leading edge and transcript detail | Execution facts and raw records are disclosures, not duplicated cards |
| Review and orchestration | Queue/roster beside the selected record; action controls adjacent to evidence | Destructive and approval actions remain explicit and distinguishable |
| Tools, skills, plugins, registry | Shared searchable catalog index and detail panel | Availability, provenance and permissions before install or enable |
| Connections, models, profiles, keys | Named provider/record rows with explicit connection or configuration actions | Advanced config is disclosed; sensitive values never exposed for styling |
| Settings | Persistent section navigation; native Appearance/Desktop settings remain usable while runtime config loads | Show load/retry feedback only in the dependent runtime section |
| Runtime, setup, compatibility | Group related diagnostics; use concise status rows and functional separators | Distinguish offline, unavailable, loading and a real zero count |
| Activity, logs and analytics | Filter controls above bounded streams/tables with monospace evidence | Refresh feedback preserves existing records and scroll position |
| Browser and media | Task toolbar, bounded content canvas and clear loading/empty recovery | Inspect/detail metadata does not compete with preview content |
| Memory and docs | Reading-width long-form content; profiles/list selection beside content | Raw snapshots and technical detail remain inspectable disclosures |
| Search and control dialogs | Trigger-related overlay, one visible title and focused search/form | Keyboard guidance and readiness are readable, not decorative chips |

## Independent session contract

Opening a second panel must not repurpose the first conversation. Keep each
panel keyed by its conversation identity and preserve its draft, scroll position,
attachments, pending approvals and in-flight turn. Selecting a panel changes the
active target for workspace-scoped commands; it does not cancel another run.
Closing a panel is presentation-only unless a distinct stop action is chosen.
Show real run state as text, never infer activity from panel focus. A one-pixel
separator plus the active panel leading edge is sufficient; do not nest another
card around transcript and composer.

Inline command approvals belong to the conversation's original room label,
the same label sent by desktop chat dispatch and projected in approval records.
Match that label exactly; an optional session key must agree. Never derive it
from the native runtime UUID or infer ownership from the focused panel.
Unattributed or conflicting records remain in the runtime-wide Review queue.
This is presentation attribution, not a replacement for runtime permission
checks. Pending commands and reasons wrap within the composer, with readable
feedback, explicit retry on load failure, and 44px decision targets.

At narrow widths, show one selected panel and an accessible session switcher.
Hidden panels retain state but must be inert and excluded from keyboard focus.
Do not squeeze two composers into the same 390px viewport. Preserve access to
session switching and stop/approval controls without horizontal page overflow.

On desktop, a session narrower than 720px shows its Context inspector in place
of its conversation, not beside a crushed transcript. The neighboring session
stays available. Closing Context restores the mounted conversation and draft.
The inspector remains a nonmodal region here; only the existing viewport-level
mobile flow is a modal dialog. Wider sessions retain side-by-side inspection.
Narrow rail tabs scroll horizontally with a visible scrollbar and keyboard
focus; empty file preview content stays stacked in normal flow.

## Interaction and state expectations

- Loading: announce a short polite status inside the affected panel; preserve
  its header and available controls. Avoid full-page loading when only runtime
  configuration is pending. Background refresh retains current content.
- Empty: distinguish no records from no matches, unavailable resources and
  runtime offline. Provide a concrete relevant next step; filtered lists offer
  Clear filters. Empty chat offers task prompts, not fabricated run results.
- Error: persist actionable inline error text with retry or configuration
  recovery. Preserve drafts and last usable records. Do not auto-dismiss errors.
- Success: update the affected control/record immediately; avoid replacing
  readable evidence with celebratory animation.
- Disabled: keep the label visible, block the action semantically, and explain
  unmet prerequisites near the control. Hover and pressed styling must not
  imply disabled controls are operable.
- Motion: 150ms background/border/color changes with the shared easing; no
  layout jumps on hover. Honor reduced motion, including loading indicators.

## Keyboard and accessibility

Conversation columns establish a named inline-size `session` container. At a
conversation width below 640px, the composer splits into two control bands:
attachment/voice/prompt tools, then bounded project/model selectors beside the
context disclosure and send/stop action. Controls have 44px minimum targets;
long selector names truncate inside their own bounds, not over other controls.
Operational status stays visible on a separate row. This applies to narrow
desktop tiles as well as mobile, without changing DOM or keyboard focus order.

The shared chat masthead uses a second control band in intermediate and narrow
windows, rather than squeezing surface tabs and Context between breadcrumbs
and runtime tools. Loading or long provider labels stay bounded; sibling
controls must never overlap.

Natural focus order is shell controls → session switcher/header actions →
transcript actions → composer controls → active supporting panel. Independent
panel headers expose an accessible session name and selected state. Switching
panels moves focus only when initiated by the keyboard, to a stable header or
composer target. Do not focus a streaming transcript on every update.

Keep existing Enter/Shift+Enter composition semantics and the displayed
platform-specific shortcuts. Buttons remain buttons and links remain links.
Content tabs implement arrows/Home/End and roving focus; simple navigation
buttons do not pretend to be ARIA tabs. Dialogs trap focus, dismiss on Escape,
and restore the invoking control. Native details retain Enter/Space behavior.
Resizable boundaries retain their accessible label and keyboard adjustments.

Approval height is budgeted against the actual pane, reserving conversation
space and the complete composer action band. A constrained pane uses a 44px
session-scoped review trigger and the SDK scrolling dialog, not a zero-height
request list or truncated command. The dialog closes when its panel, surface,
or route is hidden; focus returns only to an available invoking control.

Terminal utility controls use the same comfortable/compact control geometry.
At narrow widths they retain 44px targets and a separate action band above the
scrollable tab list. The output canvas is a real PTY surface, without scanline
overlays or decorative glow; real health and attention indicators remain.
Tab selection keeps focus on the selected tab, including successive arrow
keys; fitting or recreating xterm must not steal that focus. Explicit terminal
activation and shell-start actions retain their existing input focus behavior.

Every interactive surface uses a two-pixel `--focus-ring` derived from the
contrast-protected `--accent-text`, including standalone SDK adapters and
disclosure summaries. Selection also has a structural edge, so it is not
color-only. Verify normal text at 4.5:1, including status text on its tinted
background and primary button ink on resting and hover fills. Light theme
success/warning/error text and primary hover fill require darker semantic
values than the pre-change palette.

## Implementation and acceptance

`desktop-theme.ts` owns canonical palette, density and geometry. Existing
`*layout.ts` contracts own presentation; behavioral panel-layout models are
separate. `components/ElizaControls.tsx` wraps SDK primitives without replacing
their behavior. Only `--focus-ring` and `--control-contact` are new material
tokens; reuse existing surfaces, spacing, typography and status tokens.

Acceptance requires real desktop, narrow, dark and light captures; independent
draft/run retention; keyboard session navigation and focus restoration; visible
error/loading/empty states; no horizontal document overflow; and the existing
repository gates. A build alone is not visual or runtime proof.

No additional product choice is required for this direction. Concurrent panel
limits, reopen-after-close policy and cross-window persistence are runtime
product decisions; do not imply unsupported persistence in labels.
