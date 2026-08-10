# @doolittle/plugin-sql-relationships

Doolittle relationship merge projection over the official Eliza SQL plugin.

This package wraps the published `@elizaos/plugin-sql@2.0.3-beta.7` plugin and
leaves its persistence, reads, schema, migrations, and lifecycle unchanged.

It is deliberately Doolittle-namespaced and private: the official package owns
the SQL plugin, while this workspace adds the product behavior Doolittle needs
when a relationship already exists: normalized tags, merged metadata, and
duplicate-insert recovery.

The published runtime track for this repository is verified at `2.0.3-beta.7` and
is kept explicit via dependency alignment rather than `npm` `latest` tags.
This is not a fork or a replacement database adapter. It can be removed if an
official relationship upsert/merge contract eventually provides the same
behavior. Until then, memory counting and relationship reads delegate directly
to the official adapter so its complete room, entity, agent, metadata, and
multi-entity filters remain intact.
