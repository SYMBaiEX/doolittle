# Capability Truth

This file is generated from capability truth records registered by the Doolittle runtime.
Do not edit it by hand; run `nub scripts/sync-doc-truth.ts --write`.

## doolittle:services.web

- Runtime ID: `browser.browser`
- Headline: Browser capture is truthful about pixel versus placeholder output.
- Summary: The browser adapter exposes browser-backed capture when a Lightpanda-compatible command is available, and it falls back to placeholder artifacts when browser execution is unavailable.
- Runtime surfaces: `GET /browser/status`, `POST /browser/capture`, `POST /browser/screenshot`, `POST /browser/analyze`
- Required status fields: `captureMode`, `captureReady`, `provider`, `mode`

### Real Behavior

- Returns pixel-backed PNG screenshot artifacts when the configured browser backend is executable.
- Keeps browser status explicit so the caller can see whether capture is running in browser or fallback mode.
- Preserves placeholder markdown and SVG artifacts as the degraded path instead of pretending screenshots are real.

### Degraded Behavior

- Falls back to placeholder markdown capture output when the browser backend is unavailable or fetch execution fails.
- Reports captureMode=placeholder and captureReady=false instead of claiming full screenshot readiness.

### Caveats

- Pixel capture is a lightweight raster card generated from the fetched page snapshot, not a full DOM screenshot engine.
- Interactive upstream browser claims such as CAPTCHA solving and session management are not part of the documented Doolittle runtime contract.

## doolittle:services.media

- Runtime ID: `media.tts`
- Headline: TTS is a runtime adapter with explicit active versus degraded readiness.
- Summary: The TTS adapter delegates to the runtime media service, exposes backend selection, and degrades truthfully when no supported speech backend is configured.
- Runtime surfaces: `GET /runtime/media`, `POST /media/speak`
- Required status fields: `ready`, `backend`, `mode`

### Real Behavior

- Reports backend=eliza only when the runtime has a registered TEXT_TO_SPEECH model handler.
- Routes speech generation through runtime.useModel(ModelType.TEXT_TO_SPEECH) instead of calling a provider transport directly.
- Keeps the adapter loaded even when speech generation is unavailable so callers can inspect truthful status.

### Degraded Behavior

- Reports mode=degraded and backend=none when no speech model handler is registered.
- Does not claim enablement solely because the plugin package is installed.

### Caveats

- The runtime contract is readiness-first: callers should inspect status before treating speech generation as available.

## @doolittle/plugin-autocoder

- Runtime ID: `research.autocoder`
- Headline: Autocoder remains experimental and planning-first until real mutation flows are fully implemented.
- Summary: The autocoder plugin supports research, planning, GitHub, and secrets workflows, but planning-only flows are explicitly non-mutating and surfaced as experimental.
- Runtime surfaces: `POST /codegen/generate`, `POST /codegen/research`, `POST /codegen/prd`, `POST /codegen/qa`
- Required status fields: `experimental`, `executed`

### Real Behavior

- Returns planning-only scaffolds with executed=false for non-mutating code generation flows.
- Keeps GitHub and secrets helpers available without overstating end-to-end execution support.
- Marks the runtime catalog entry as maturity=experimental.

### Degraded Behavior

- Does not claim files were written or dependencies were installed when the plugin only produced a plan.
- Avoids presenting suggested next steps as completed execution.

### Caveats

- The autocoder surface is still useful for structured planning, but it should not be documented as a production-grade autonomous code writer yet.

## @elizaos/app-core/account-pool

- Runtime ID: `orchestration.multi-account`
- Headline: Claude, Codex, and direct API accounts use Eliza's official multi-account selector bridge.
- Summary: Doolittle stores distinct Claude and Codex subscription accounts plus OpenAI and Anthropic API-key accounts with the Eliza SDK account store, exposes secret-free pool controls, and lets the official orchestrator select an eligible account for each coding-agent session.
- Runtime surfaces: `GET /runtime/account-pool`, `POST /runtime/account-pool/:provider/import`, `POST /runtime/account-pool/:provider/strategy`, `POST /runtime/account-pool/:provider/select`, `PATCH /runtime/account-pool/:provider/:accountId`, `DELETE /runtime/account-pool/:provider/:accountId`
- Required status fields: `bridgeInstalled`, `providerId`, `strategy`, `accounts`, `health`

### Real Behavior

- Keeps multiple official credential records per provider instead of overwriting a provider singleton.
- Imports direct API accounts from a named Eliza secret whose resolved value stays server-side and is never returned by the account routes.
- Injects only the selected subscription credential into the spawned Claude or Codex subprocess through Eliza's coding-account bridge.
- Projects account health and usage without returning access or refresh tokens to the API or desktop UI.

### Degraded Behavior

- Leaves the official orchestrator available when no pooled account is eligible, while reporting an empty pool and bridge readiness truthfully.
- Requires an existing native provider sign-in before a credential can be imported into a named pool account.

### Caveats

- Credential-safe tests prove storage, selection, and rotation without using live provider accounts; live quota and OAuth behavior remains an opt-in alpha smoke.

## @elizaos/plugin-agent-orchestrator

- Runtime ID: `research.orchestrated`
- Headline: Research is an explicit task capability, not a coding framework alias.
- Summary: Doolittle executes official research tasks through the shared Eliza RESEARCH model path, while coding tasks continue through ACP workers with Doolittle's file, search, patch, and terminal tools.
- Runtime surfaces: `DOOLITTLE_RESEARCH`, `POST /delegation/tasks`, `POST /delegation/tasks/:id/children`, `POST /delegation/tasks/:id/execute`
- Required status fields: `kind`, `capabilityProfile`, `framework`, `status`, `executionMode`, `researchRun`

### Real Behavior

- Maps capabilityProfile=research to an official research task while leaving providerPolicy.preferredFramework unset unless the operator chooses a framework.
- Executes research tasks directly through Eliza ModelType.RESEARCH, records a sessionless durable research receipt, and validates real model output without a human override.
- Passes a per-run abort signal to RESEARCH providers and always keeps durable cancellation guards; provider network cancellation begins with Eliza releases that declare ResearchParams.signal.
- Does not mislabel an ACP coding session as deep research; coding tasks retain the official ACP spawn path.
- Keeps coding workers on the same official orchestrator while granting them Doolittle's real workspace and terminal tool surfaces.

### Degraded Behavior

- Records a failed research receipt and clear unavailable result when no RESEARCH model is registered instead of claiming a sourced report was produced.
- Keeps deterministic no-network acceptance coverage available when live provider credentials are absent.

### Caveats

- Live deep research requires an authenticated official OpenAI or Eliza Cloud provider and can take several minutes; the deterministic alpha harness uses a registered fake RESEARCH handler.
- ElizaOS beta.7 has no typed non-ACP execution primitive, so Doolittle records the external research lifecycle through the official task service's durable update, message, and validation methods.
