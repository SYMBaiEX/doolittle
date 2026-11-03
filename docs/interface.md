# Interface development

The desktop renderer lives in [apps/desktop/src/renderer](../apps/desktop/src/renderer).
Shared browser-only controls live in [packages/ui](../packages/ui). Native process,
filesystem, credential, and Electron operations belong behind the preload and
main-process boundaries described in [architecture](architecture.md).

## Layout and styling

Use the existing theme tokens and SDK-backed controls before adding new styles.
The default interface is a restrained messenger: one readable conversation,
a compact composer, and supporting tools shown on demand. Companion and Canvas
are presentations of the same underlying sessions and capabilities.

- Preserve the existing reading width, typography, spacing, and density tokens.
- Use semantic text emphasis for persistent selection, with `aria-current` or
  `aria-selected` as appropriate.
- Keep normal lists and forms visually quiet; avoid decorative cards around each row.
- Use real control states for checked, pressed, loading, disabled, and invalid values.
- Do not apply text-field dimensions to native checkbox, radio, range, file, or color controls.

Message inputs and dropdown triggers must never gain a thick focus frame, orange
outline, or glow. Use the existing thin neutral edge, small neutral background,
or inset cue. Keyboard focus must remain visible, including when custom theme
colors coincide. Preserve the system focus outline in forced-color mode.
Validation errors may use their existing semantic treatment.

Keep the composer mounted while it moves from the welcome layout to the bottom
dock. Transcript history scrolls independently. Small heights and split views
must retain access to the composer, notices, and controls without overflowing
the application window.

## State and interaction

Drafts, queued messages, active streams, editor documents, terminals, and request
identities must outlive replaceable presentation components. Switching views,
themes, or contacts must not resend messages, cancel work, or reset drafts.

Use immutable bot, conversation, and workspace origins for async operations.
A late reply must not mutate a newly selected conversation. Revoke stale menus
and intents when ownership changes. Closing a view removes presentation;
execution stops only through the explicit runtime cancellation flow.

Workspace views keep the saved arrangement when the window temporarily requires
one visible conversation. Canvas supports balanced side-by-side and stacked
arrangements, nested splits, physical reordering, size balancing, and temporary
focus/restore. The Panels menu also closes other views and reopens the last
closed view. Opening another conversation preserves the split mode. Keep the
12-view limit separate from runtime task admission, and preserve keyboard focus
when moving or closing a view.

Inspector width is measured against its conversation pane and reserves room for
the transcript. Narrow panes use the full-width inspector sheet without
rewriting the preferred width. Closing the inspector retains its selected view.
Library and Computer remember independent tabs and resource selections under
bot, conversation, and workspace ownership. Persist presentation choices only;
document contents, command output, and repository facts stay runtime-owned.

Use the existing controlled context menu for app objects. Right-click,
Shift-F10, and overflow controls should expose the same supported actions.
Callbacks retain permission, busy-state, and confirmation checks. Text inputs
and selected text keep native editing behavior; editor and terminal surfaces
retain their established input handling.

Menus and dialogs should use short transform/opacity transitions. Closing
surfaces become inert immediately. Reduced motion, reduced transparency, and
forced-color preferences need readable static alternatives. Motion never
substitutes for an execution status.

## Models, errors, and permissions

Populate provider and model controls from runtime-supported choices. Preserve
unavailable saved routes until the user chooses a replacement; never silently
select another provider. Choosing a model grants no account access.

Distinguish loading, empty, unavailable, and failed states. A history-loading
failure is not an empty conversation. Starting, waiting, completed, stopped,
and error states must follow runtime facts. A transport failure does not prove
that a process stopped.

Privileged actions go through the existing preload contract and
[main-process API policy](../apps/desktop/src/main/ipc/agent-api-policy.ts).
Do not expose Node or Electron modules to the renderer or bypass native project
confirmation with an ambient UI selection. Error notices must not reveal
credentials, raw private paths, or copied clipboard content.

## Verification

Run `nub run desktop:dev` for the renderer hot-reload and runtime watch loop.
Use [testing](testing.md) to choose focused tests and native desktop journeys.

Check keyboard navigation, accessible names, focus restoration, scrolling at
compact widths and heights, light/dark themes, and the relevant reduced-motion
or forced-color states for affected controls. Inspect rendered behavior when
changing layout or animation; DOM tests alone do not establish visual quality.

Useful source owners include the
[appearance hook](../apps/desktop/src/renderer/use-desktop-appearance.ts),
[route dialog](../apps/desktop/src/renderer/components/RouteControlDialog.tsx),
and [shared UI exports](../packages/ui/src/index.ts).
