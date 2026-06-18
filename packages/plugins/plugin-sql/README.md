# @elizaos/plugin-sql

Workspace-owned SQL plugin aligned to the Doolittle runtime line.

This package wraps the published `@elizaos/plugin-sql@2.0.0-beta.1` plugin and
adapts it to the `@elizaos/core@2.0.0-beta.1` runtime contract used by this repo.

The published `beta.1` package ships a broken `bun` export condition (its `bun`
conditions point at `./src/*.ts` sources that are not published — only the built
`src/dist/` output is), which resolves to nothing under the Bun runtime. This
repo applies a local fix via `bun patch`
(`patches/@elizaos%2Fplugin-sql@2.0.0-beta.1.patch`) that redirects each `bun`
condition to the built output. Keep the patch until upstream ships a fixed beta.
