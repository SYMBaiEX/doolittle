# @doolittle/storage

Small shared Node helper for reading optional JSON state. Desktop main-process
code, agent services, and product plugins use it to keep filesystem and parse
failures visible without depending on another application's runtime.

## API

```ts
import { readOptionalJson } from "@doolittle/storage";

const value = readOptionalJson("/absolute/path/to/state.json");
```

[`readOptionalJson<T = unknown>(path)`](src/index.ts) synchronously reads UTF-8
JSON and returns the parsed value. A missing file (`ENOENT`) returns `null`.
Unreadable files, directories, invalid paths, and malformed JSON throw. A JSON
file containing `null` also returns `null`.

The generic parameter supplies a TypeScript type; it does not validate the
parsed value. Use `unknown` and validate at the consuming state boundary when
the file's schema or trust matters. This package does not write files, migrate
schemas, or replace SDK database and credential persistence.

## Development

From the repository root:

```sh
nub run --cwd packages/storage typecheck
nub run test:scope tests/boundary/optional-json-state.test.ts
```

There is no build step; the workspace exports TypeScript source. See
[architecture](../../docs/architecture.md) for package boundaries and
[security](../../docs/security.md) for state-handling conventions.
