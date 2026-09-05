# Desktop information architecture consolidation

This checklist is the durable implementation record for simplifying Doolittle
Desktop without removing product capability. The target is five stable
destinations: **Home**, **Chat**, **Code**, **Work**, and **Settings**. Activity,
help, and other short-lived surfaces are overlays or contextual panels.

Update this file as implementation evidence changes. A checked item means the
behavior exists in the current checkout and has the listed proof, not merely
that code was written for it.

## Acceptance contract

- [x] `CHECKLIST-01` Record the complete migration scope and proof requirements
  in the repository.
- [ ] `NAV-01` Replace the flat route-first navigation model with semantic
  destinations and nested sections while preserving old hashes through
  redirects for one release.
- [ ] `SETTINGS-01` Consolidate models, providers, credentials, tools, skills,
  plugins, memory, profiles, registry, runtime, logs, compatibility, setup, and
  About under searchable Settings sections.
- [x] `WORK-01` Consolidate review, automations, and the gateway inbox into Work
  alongside tasks, agents, plans, and runs.
- [ ] `CHAT-01` Consolidate sessions into Chat history and make Media a Chat
  action or contextual artifact surface.
- [ ] `CODE-01` Consolidate browser and preview into Code while preserving
  localhost evidence capture and send-to-chat behavior.
- [ ] `OVERLAY-01` Present Activity as a global drawer and Help/About as an
  overlay or Settings section instead of workspace destinations.
- [x] `DENSITY-01` Prevent the sidebar, Tools, and Workbench from starving the
  primary canvas; preserve a stable History affordance in both sidebar modes.
- [x] `CLEANUP-01` Remove only architecture helpers proven redundant. Retain
  route prefetch cancellation and project-navigation intent until their
  protected behavior has a replacement.
- [ ] `DOCS-01` Update the desktop guide, command descriptions, screenshots, and
  navigation terminology to match the shipped model.
- [ ] `QA-01` Pass focused navigation tests, desktop typecheck and tests, root
  typecheck and tests, build, lint, and repository acceptance checks.
- [ ] `INSTALL-01` Build the packaged macOS application and install the current
  checkout locally for manual testing.

## Migration waves

### 1. Navigation foundation

- [x] Introduce a typed desktop location with destination and optional section.
- [x] Parse both canonical nested hashes and every legacy route hash.
- [x] Serialize only canonical hashes for new navigation.
- [x] Preserve dirty-editor confirmation across destination and section changes.
- [x] Update command-palette, activity, project, and deep-link navigation.
- [ ] Add parser, serializer, redirect, history, and dirty-navigation tests.

### 2. Settings consolidation

- [ ] Define grouped Settings sections with stable labels and search keywords.
- [ ] Embed existing feature pages without duplicating resource ownership.
- [ ] Keep Appearance and Desktop usable while the runtime is offline.
- [ ] Preserve degraded read-only diagnostics for runtime-related sections.
- [ ] Remove the duplicate Models destination and duplicate Settings entry.

### 3. Work consolidation

- [x] Remove the separate Review route wrapper and keep Review as a Work tab.
- [x] Add Automations and Inbox tabs using the existing feature components.
- [x] Route dashboard approvals, task links, and activity targets to exact tabs.
- [x] Preserve project-scoped focus state and lazy resource activation.

### 4. Chat and Code consolidation

- [ ] Make History a first-class Chat panel in expanded and collapsed layouts.
- [ ] Move Media entry points into the composer or contextual Chat tools.
- [ ] Add Preview and browser evidence as Code panels.
- [ ] Preserve shared terminal state across Chat, Code, and Work.
- [ ] Normalize the label `Changes` across Code, Chat, and Review.

### 5. Overlays and shell density

- [ ] Keep Activity globally reachable without a standalone route.
- [ ] Move Help/About to Settings and retain a direct keyboard/search action.
- [x] Make Tools modal or overlay before a docked Workbench would squeeze the
  canvas below its usable width.
- [ ] Close or replace competing secondary panels when context changes.
- [ ] Verify keyboard focus return, escape behavior, narrow viewports, and
  reduced-motion behavior.

### 6. Evidence-backed cleanup

- [x] Simplify redundant route-capability fields and the tautological render
  helper while preserving `apiRead` and `writes` behavior.
- [x] Delete the unused `WorkspacePages.tsx` compatibility export.
- [x] Replace the one-use `ProjectSidebar.tsx` barrel with direct imports.
- [ ] Re-run dependency and residual-reference scans after route wrappers leave.
- [ ] Profile before changing route resource prefetch behavior.

### 7. Release proof

- [ ] Run the focused desktop navigation and layout tests.
- [ ] Run every repository gate listed in `AGENTS.md`.
- [ ] Exercise Home, Chat, Code, Work, Settings, legacy links, offline Settings,
  and narrow layouts in the built application.
- [ ] Package and install the macOS application from the verified checkout.
- [ ] Record remaining external-only or manual checks explicitly.

## Decisions kept intentionally

- The terminal remains a shared persistent surface, not a destination.
- Compact and Comfortable density preferences remain; Compact is the desktop
  default rather than a global reduction of every font and control.
- Route module and resource warming remains until measurements show it harms
  startup or navigation. Its dwell and cancellation behavior prevents pointer
  sweeps from producing API bursts.
- Project navigation intent remains centralized until the semantic location
  migration replaces all three protected flows together.
- Legacy route hashes remain accepted for one release, but newly generated
  links use the canonical destination and section format.
