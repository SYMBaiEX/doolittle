# Doolittle skills

`@doolittle/skills` is an asset workspace containing native ElizaOS skill
documents. It has no JavaScript entrypoint or build step. The current skill list
is in [`index.md`](index.md); avoid maintaining a second inventory here.

## Layout

- Default skills are direct child directories containing `SKILL.md`.
- [`.optional/`](.optional/) holds the separate optional catalog surfaced by
  `/skills optional`; its hidden root stays outside default SDK discovery.
- `.generated/` holds ignored local bookkeeping. Approved generated skills use
  the same direct-child layout as curated skills, with provenance in frontmatter.

The runtime consumes these files through the official skills parser and agent
skills services. Desktop development watches skill assets, and packaged builds
copy the workspace and explicitly include the optional catalog.

## Add or update a skill

Create `<skill-name>/SKILL.md` with YAML frontmatter:

```md
---
name: example
description: Explain the concrete request that should route to this skill.
---

# Example

Give focused instructions and an observable deliverable.
```

Match `name` to the directory. Keep routing descriptions specific and instructions
short. Record category and provenance in the document instead of creating extra
directory layers under the default skill root. Update `index.md` when curated
skills change.

From the repository root, verify parsing and catalog discovery:

```sh
nub run test:scope tests/boundary/bundled-skills.test.ts tests/boundary/ecosystem-skills.test.ts
nub run check:local-links
```

See [architecture](../../docs/architecture.md) for runtime ownership and
[development](../../docs/development.md) for the asset reload loop.
