# @elizaos/plugin-sql

Doolittle compatibility wrapper around the official Eliza SQL plugin.

This package wraps the published `@elizaos/plugin-sql@2.0.3-beta.7` plugin and
adapts it to the `@elizaos/core@2.0.3-beta.7` runtime contract used by this
repo.

The published runtime track for this repository is verified at `2.0.3-beta.7` and
is kept explicit via dependency alignment rather than `npm` `latest` tags.
The workspace wrapper only retains Doolittle-specific relationship metadata
normalization and duplicate-insert recovery. Memory counting and relationship
reads are delegated directly to the official beta.7 adapter so its complete
room, entity, agent, metadata, and multi-entity filters remain intact.
