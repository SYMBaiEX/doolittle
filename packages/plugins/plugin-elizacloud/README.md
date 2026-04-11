# @elizaos/plugin-elizacloud

Workspace-native Eliza Cloud provider plugin for managed ElizaOS inference in Doolittle.

## What it does

- Uses Eliza Cloud as a managed inference and embeddings endpoint
- Authenticates with `ELIZAOS_CLOUD_API_KEY`
- Treats Eliza Cloud as the preferred default provider path during onboarding
- Works with the native local auth flow: `elizaos login`

## Expected settings

- `ELIZAOS_CLOUD_API_KEY`
- `ELIZAOS_CLOUD_BASE_URL`
- `ELIZAOS_CLOUD_SMALL_MODEL`
- `ELIZAOS_CLOUD_LARGE_MODEL`
- `ELIZAOS_CLOUD_EMBEDDING_MODEL`
- `ELIZAOS_CLOUD_EMBEDDING_URL`
- `ELIZAOS_CLOUD_EMBEDDING_API_KEY`
- `ELIZAOS_CLOUD_EMBEDDING_DIMENSIONS`
- `ELIZAOS_CLOUD_ENABLED`

## Local flow

From the repo root:

```bash
elizaos login
doolittle setup
```

Or, during first install:

```bash
bash scripts/install.sh
```

The onboarding flow will prefer Eliza Cloud first, carry forward an existing bond when available, and only fall back to other providers when Cloud is not ready.
