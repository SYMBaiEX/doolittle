# @elizaos/plugin-sql

Workspace-owned SQL plugin aligned to the Doolittle runtime line.

This package wraps the published `@elizaos/plugin-sql@2.0.3-beta.7` plugin and
adapts it to the `@elizaos/core@2.0.3-beta.7` runtime contract used by this
repo.

The published runtime track for this repository is verified at `2.0.3-beta.7` and
is kept explicit via dependency alignment rather than `npm` `latest` tags.
The workspace wrapper remains responsible for Doolittle-specific relationship
metadata normalization and duplicate-insert recovery.
