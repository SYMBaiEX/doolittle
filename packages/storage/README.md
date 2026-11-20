# @doolittle/storage

Shared Node file operations for desktops, terminal jobs, agent services, and
release tooling. Callers retain ownership of path authorization and schemas.

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
the file's schema or trust matters.

Use [the regular-file helpers](src/regular-file.ts) when reading untrusted or
size-bounded inputs. They reject final symlinks, pin the opened file, and detect
changes during reading. Callers can require a single hard link and set a tighter
byte limit. Callers with an already-open descriptor can read from byte zero
without moving its offset. Exclusive verified writes are available for private
staging files. Database, credential, and schema migration stay with their
existing owners.

## Development

From the repository root:

```sh
nub run --cwd packages/storage typecheck
nub run test:scope tests/boundary/optional-json-state.test.ts
```

There is no build step; the workspace exports TypeScript source. See
[architecture](../../docs/architecture.md) for package boundaries and
[security](../../docs/security.md) for state-handling conventions.
