# Module Structure Guidelines

This repo is converging on a folder-first layout with thin entrypoints.

## Core rules

- let the folder own the domain name
  - inside `gateway/`, prefer `read-model.ts` over `gateway-read-model.ts`
  - inside `services/media/`, prefer `inspection/service.ts` over `media-service-inspection.ts`
- keep top-level entry files orchestration-only
  - acceptable entrypoint names: `index.ts`, `service.ts`, `route.ts`, `runtime.ts`, `cli.ts`
  - push branching logic and formatting helpers into sibling modules or subfolders
- colocate tests with the modules they exercise
  - prefer `foo.ts` + `foo.test.ts` in the same folder
- keep types in one obvious place per namespace
  - prefer `types.ts` for a small surface
  - prefer `types/` when the namespace has multiple type-only modules
- avoid compatibility facades in new work
  - migrate callers to the canonical folder-owned module and remove the old shim once the slice is complete

## Preferred patterns

- domain folder with a stable entry surface
  - `server/routes/identity.ts`
  - `server/routes/identity/profiles.ts`
- service folder with decision-local helpers
  - `services/trajectory/service/index.ts`
  - `services/trajectory/latest-benchmark.ts`
- subdomain folders when a namespace has multiple seams
  - `gateway/read/*`
  - `runtime/native/service-bridge/transport-control.ts`
  - `scripts/bootstrap/prompting/*`

## Naming anti-patterns

- repeating the folder name in every file
  - prefer `gateway/receive/replay.ts` over
    `gateway/receive/gateway-receive-replay.ts`
  - prefer `services/media/formatters/index.ts` over
    `services/media/media-formatters.ts`
  - prefer `services/terminal/service.ts` over
    `services/terminal/terminal-service.ts`
- compatibility barrels that preserve an obsolete path after every caller has
  moved; keep moved modules on their canonical folder paths, such as
  `gateway/runner/index.ts`
- hybrid ownership for the same domain
  - avoid keeping both `services/foo-service.ts` and `services/foo/*` as competing homes for new logic
- generic helper dumping grounds
  - avoid `helpers.ts`, `utils.ts`, or `misc.ts` when the file can be named for a concrete responsibility
- duplicated namespace prefixes
  - avoid names like `services/services-tools-dynamic-state.ts`

## Direction for new work

- prefer domain-first folders in `packages/agent/src/`
- keep only true process-root files at the top of `scripts/bootstrap/`
- normalize service namespaces so each domain has one clear home
- remove obsolete compatibility paths in the same change that migrates their
  final caller

## Review checklist

- can a new reader guess where logic belongs from the folder name alone?
- does the filename add new meaning, or just repeat the folder?
- is the entry file mostly orchestration rather than implementation detail?
- are types and tests easy to find without searching?
- if a file moved, is the compatibility story explicit?
