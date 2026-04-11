# @elizaos/plugin-tts

This workspace package is documented from the stabilized Doolittle runtime contract.
Do not edit it by hand; run `bun run scripts/sync-doc-truth.ts --write`.

## Status

- Runtime ID: `media.tts`
- Category: `media`
- Kind: `adapter`
- Maturity: `alpha`
- Persistence: `injected`
- Publish intent: `internal-adapter`
- Tests: `covered`

## Runtime Contract

- TTS is a runtime adapter with explicit active versus degraded readiness.
- The TTS adapter delegates to the runtime media service, exposes backend selection, and degrades truthfully when no supported speech backend is configured.
- Runtime surfaces: `GET /runtime/media`, `POST /media/speak`
- Required status fields: `ready`, `backend`, `mode`

## Real Behavior

- Reports backend=fal or backend=openai when a speech backend is configured.
- Routes speech generation through the runtime media service instead of shipping a stub-only plugin.
- Keeps the adapter loaded even when speech generation is unavailable so callers can inspect truthful status.

## Degraded Behavior

- Reports mode=degraded and backend=null when no speech backend is configured.
- Does not claim enablement solely because the plugin package is installed.

## Caveats

- The runtime contract is readiness-first: callers should inspect status before treating speech generation as available.

## Cross References

- Canonical plugin inventory: `docs/plugin-inventory.md`
- Canonical capability truth: `docs/capability-truth.md`
