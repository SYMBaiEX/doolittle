# Package ownership

The root workspace manifest lists the current packages and pins the ElizaOS
source baseline and published package exceptions. The [monorepo guide](monorepo.md)
describes their roles. Keep Doolittle's client and product behavior separate
from upstream agent-engine ownership.

`packages/skills` contains the default native skill documents and an `.optional/`
catalog. The latter remains outside the default direct-child skill layout; the
runtime's optional-skills command and API expose it separately.

`packages/storage` owns the shared strict JSON state reader used by desktop,
agent services, and Doolittle plugins. It treats missing files as optional while
surfacing unreadable or malformed state. Keeping one small package avoids a
client-to-agent dependency or divergent error handling across these consumers.

`packages/solana-layouts` is a local dependency compatibility package; see its
[README](../packages/solana-layouts/README.md). `vendor/elizaos` contains pinned
source-build archives, receipts, and workspace manifests. `tooling/eliza-source`
contains their isolated build inputs. See [SDK upgrades](engineering/sdk-package-upgrades.md)
and [source qualification](../tooling/eliza-source/README.md) before changing either.

Use `nub run check:monorepo` to validate workspace dependencies and boundaries,
and `nub run check:eliza-sdk` to validate the SDK release contract.
