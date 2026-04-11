# @elizaos/plugin-browser

This workspace package is documented from the stabilized Doolittle runtime contract.
Do not edit it by hand; run `bun run scripts/sync-doc-truth.ts --write`.

## Status

- Runtime ID: `browser.browser`
- Category: `browser`
- Kind: `adapter`
- Maturity: `alpha`
- Persistence: `injected`
- Publish intent: `internal-adapter`
- Tests: `covered`

## Runtime Contract

- Browser capture is truthful about pixel versus placeholder output.
- The browser adapter exposes browser-backed capture when a Lightpanda-compatible command is available, and it falls back to placeholder artifacts when browser execution is unavailable.
- Runtime surfaces: `GET /browser/status`, `POST /browser/capture`, `POST /browser/screenshot`, `POST /browser/analyze`
- Required status fields: `captureMode`, `captureReady`, `provider`, `mode`

## Real Behavior

- Returns pixel-backed PNG screenshot artifacts when the configured browser backend is executable.
- Keeps browser status explicit so the caller can see whether capture is running in browser or fallback mode.
- Preserves placeholder markdown and SVG artifacts as the degraded path instead of pretending screenshots are real.

## Degraded Behavior

- Falls back to placeholder markdown capture output when the browser backend is unavailable or fetch execution fails.
- Reports captureMode=placeholder and captureReady=false instead of claiming full screenshot readiness.

## Caveats

- Pixel capture is a lightweight raster card generated from the fetched page snapshot, not a full DOM screenshot engine.
- Interactive upstream browser claims such as CAPTCHA solving and session management are not part of the documented Doolittle runtime contract.

## Cross References

- Canonical plugin inventory: `docs/plugin-inventory.md`
- Canonical capability truth: `docs/capability-truth.md`
