# October 2026 interface deep pass

This is the follow-up to the lean overhaul, not a new runtime architecture or
a claim that every capability has been exercised live. The request was a
deeper pass over chat and all interface families, with no side-card or tab
highlights. Existing user data, permission boundaries and session/resource
identities are preserved.

## Implementation graph

```text
Shared controls, tokens, materials and selection contract
  ├─ Chat, messages, composer, menus and inspector
  ├─ Navigation, retained views and workspace tabs
  ├─ Settings, native lifecycle and interface grants
  └─ Secondary screens and embedded workspaces
         ↓
Independent correctness review → integration → packaged/native inspection

Observed runtime lock contention → owned-process shutdown fixes
         └────────────────────────→ integration
```

The five UI owners used disjoint source responsibilities and small focused
checks. A separate review reproduced save/filter concurrency and checked
completed-save acknowledgments rather than relying only on happy-path tests.
Runtime shutdown work followed an actual
installed-app failure; it does not establish why the original parent exited.

## Source coverage and changes

| Family | Changes and retained boundaries |
| --- | --- |
| Shared system | 14px controls, 16px conversation text, dedicated code sizing, 40px ordinary/44px narrow targets; restrained menu material; readable empty/error feedback; no decorative entry/press scaling. SDK portals, focus and collision behavior retained. |
| Chat | Specialist attribution, Markdown whitespace in partial failures, readable code/tables, quieter progress announcements, stable tool-output inspection while streaming, SDK header menus, session-bound prompt tools and late-dictation focus. Draft/run ownership unchanged. |
| Navigation and views | Flat bot contacts and separate recent conversations, visible older active conversations, working collapsed destinations, inert closed mobile navigation, stale-catalog retry, long titles, close-focus restoration and safe asynchronous tab-option updates. |
| Settings | All seven categories and 19 subsection identities retained. Compact offline guidance, real read-only enforcement, volatile draft retention, save/reset feedback, duplicate-write protection, lifecycle read recovery, stale snapshot guards and explicit interface grant prerequisites. Health does not grant permission. |
| Supporting pages | Sessions, team/work, activity/dashboard, connections/accounts/models/keys, tools/plugins/skills/registry, memory/profiles, automation, reviews, coding, browser, media, files and workbench. Selected title weights replace fills/stripes; forms reflow against available containers; browser/git/terminal/voice chrome is legible. Model and voice pickers use SDK portals rather than being clipped by short-pane composer scrolling. Feature execution internals are not rewritten. |
| Runtime recovery | Quit waits for all owned children, repeated quit cannot bypass shutdown, failed shutdown leaves recovery UI available, cancelled startup cannot become ready, desktop IPC loss shuts down the runtime, and lock contention cannot move aside a healthy database. |

Selection is indicated by text weight and ARIA, not persistent background,
accent rail, category dot, tab capsule or underline. Transient menu selection,
hover and keyboard focus remain visible. Actual error/status colors and native
checked state remain meaningful. Text-field geometry excludes native
checkbox/radio/range/file/color controls.

## Verification record

Owner-focused checks passed for shared UI (96), chat (133), retained workspace
behavior (56), settings (49, with focused safety follow-ups), secondary screens
and lifecycle boundaries (16 desktop and nine runtime tests). Additional independent review passed 30 tests
across five focused files and reproduced a real deferred-save remount race,
which was sent back for correction. These overlap owner checks and must not be
added into a misleading total. Source-contract tests complement behavior tests;
they are not proof of appearance or accessibility in Electron.

Root `nub run typecheck` (including UI), `nub run desktop:typecheck` and the
eight-file `nub run test` loop passed; the latter ran 56 tests in 1.02 seconds.
Final desktop typecheck passed again after the portal and settings fixes.
The agent CLI/ACP build passed in 160ms. The final secondary detail scope passed
66 tests; model/project/selection scope passed 50; voice passed 15. Settings
review fixes passed 20 tests, followed by 16 for acknowledgment/reversion cases.
These scopes overlap. All 126 changed TypeScript/TSX/CSS files were checked by
Biome; 11 formatting-only findings were repaired with its focused check/write.
Diff hygiene and the local documentation-link check passed.
The native-shaped-input and quiet command-navigation integration regressions passed 11 tests. Build,
packaged/native results and exact install identity are recorded below when
completed. Full unchanged suites and paid-provider flows are not part of this
iteration's fast loop.

### Installed-app baseline

The previous build was inspected natively. It showed selected bot fills,
settings capsules/current-category markers and an oversized offline theme block.
Its local runtime failed because another live Doolittle process owned the
PGlite lock. That process subsequently exited without any agent signal; the
reason is unknown. No database or lock was deleted or moved. Native runtime
restart was used after the owner disappeared and the app returned to Local
runtime ready with existing bots and recent conversations visible.

The pre-pass installed app was copied intact to
`/Users/symbiex/.local/state/doolittle/local-install/ui-deep-pass-7GuJHcTE/Doolittle-before-ui-deep-pass.app`.
Its ASAR digest is
`333ad4b352f24266f9c82907565ab408e9b9aee65fdc506db2e10081a842e8b3`.

### Remaining evidence boundaries

VoiceOver, real provider/account writes, native approval races, community-host
rendering, every viewport/theme combination and paid model behavior need
their own live evidence. A source-wide family review is not exhaustive live
interaction coverage. Preserve saved appearance and background preferences
during validation; do not infer execution readiness from styling.
