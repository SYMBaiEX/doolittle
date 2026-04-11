# @elizaos/plugin-autocoder

This workspace package is documented from the stabilized Doolittle runtime contract.
Do not edit it by hand; run `bun run scripts/sync-doc-truth.ts --write`.

## Status

- Runtime ID: `research.autocoder`
- Category: `research`
- Kind: `adapter`
- Maturity: `experimental`
- Persistence: `injected`
- Publish intent: `internal-adapter`
- Tests: `covered`

## Runtime Contract

- Autocoder remains experimental and planning-first until real mutation flows are fully implemented.
- The autocoder plugin supports research, planning, GitHub, and secrets workflows, but planning-only flows are explicitly non-mutating and surfaced as experimental.
- Runtime surfaces: `POST /codegen/generate`, `POST /codegen/research`, `POST /codegen/prd`, `POST /codegen/qa`
- Required status fields: `experimental`, `executed`

## Real Behavior

- Returns planning-only scaffolds with executed=false for non-mutating code generation flows.
- Keeps GitHub and secrets helpers available without overstating end-to-end execution support.
- Marks the runtime catalog entry as maturity=experimental.

## Degraded Behavior

- Does not claim files were written or dependencies were installed when the plugin only produced a plan.
- Avoids presenting suggested next steps as completed execution.

## Caveats

- The autocoder surface is still useful for structured planning, but it should not be documented as a production-grade autonomous code writer yet.

## Cross References

- Canonical plugin inventory: `docs/plugin-inventory.md`
- Canonical capability truth: `docs/capability-truth.md`
