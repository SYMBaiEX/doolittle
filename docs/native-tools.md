# Doolittle Native Tools

Doolittle can compile small, product-owned TypeScript utilities to standalone
native executables with [ScriptC](https://scriptc.dev/). This is an optional
operator and distribution lane. It does not replace the ElizaOS runtime.

## Ownership boundary

Native compilation is allowed only for self-contained Doolittle utilities that
sit outside ElizaOS lifecycle ownership. Native tools must not implement or
fork model routing, provider clients, plugins, tasks, memory, gateway state,
skills, or runtime services.

The first tool is `doolittle-probe`. It calls the canonical Doolittle `/health`
route and reports the response; the running Eliza-backed API remains the source
of truth. The probe has no ElizaOS package imports and does not interpret or
duplicate runtime readiness rules.

## Commands

From the repository root:

```bash
nub run native:status
nub run native:coverage
nub run native:build
nub run native:test
nub run native:verify
```

The build writes the current-platform executable to `dist/native/`:

```bash
doolittle native probe
doolittle native probe http://127.0.0.1:4312
```

The standalone executable can also be invoked directly:

```bash
dist/native/doolittle-probe http://127.0.0.1:3000
```

If the API requires authentication, set `ELIZA_API_TOKEN` in the process
environment. Do not pass tokens in the URL or command arguments. The probe
rejects credential-bearing URLs and bounds non-JSON response output.

## Toolchain policy

- ScriptC is pinned as a development dependency. It is not shipped inside the
  Electron application or loaded into the Eliza runtime.
- The probe must remain fully static under `scriptc coverage`; dynamic-engine
  fallback is not accepted for this lane.
- Native compilation stays opt-in because ScriptC is experimental and native
  compiler availability varies by platform. The normal Node/Electron runtime
  and repository gates remain authoritative.
- Generated native executables are build artifacts and are not committed.
- A new native entry requires an explicit Doolittle-owned use case, tests, and
  an ownership review. Arbitrary repository TypeScript is intentionally not
  accepted by `doolittle native`.

This arrangement lets Doolittle gain fast standalone utilities while remaining
a reference ElizaOS desktop rather than a private fork of Eliza.
