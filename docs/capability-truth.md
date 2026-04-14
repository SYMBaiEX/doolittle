# Capability Truth

This file is generated from the code-backed capability truth records used during the stabilization pass.
Do not edit it by hand; run `bun run scripts/sync-doc-truth.ts --write`.

## @elizaos/plugin-browser

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

## @elizaos/plugin-tts

- Runtime ID: `media.tts`
- Headline: TTS is a runtime adapter with explicit active versus degraded readiness.
- Summary: The TTS adapter delegates to the runtime media service, exposes backend selection, and degrades truthfully when no supported speech backend is configured.
- Runtime surfaces: `GET /runtime/media`, `POST /media/speak`
- Required status fields: `ready`, `backend`, `mode`

### Real Behavior

- Reports backend=fal or backend=openai when a speech backend is configured.
- Routes speech generation through the runtime media service instead of shipping a stub-only plugin.
- Keeps the adapter loaded even when speech generation is unavailable so callers can inspect truthful status.

### Degraded Behavior

- Reports mode=degraded and backend=null when no speech backend is configured.
- Does not claim enablement solely because the plugin package is installed.

### Caveats

- The runtime contract is readiness-first: callers should inspect status before treating speech generation as available.

## @elizaos/plugin-autocoder

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
