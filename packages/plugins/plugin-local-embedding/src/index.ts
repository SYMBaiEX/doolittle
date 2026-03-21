import type { Plugin } from "@elizaos/core";
import {
  createServiceAdapter,
  createServicePlugin,
  stableHashVector,
} from "@elizaos-official/compat";

export function createLocalEmbeddingPlugin(): Plugin {
  const LocalEmbeddingService = createServiceAdapter({
    serviceType: "local_embedding",
    capabilityDescription:
      "Official-style local embedding service using deterministic offline vectors.",
    create: async () => ({
      embed(text: string, dimensions = 16) {
        return stableHashVector(text, dimensions);
      },
      similarity(left: string, right: string, dimensions = 16) {
        const a = stableHashVector(left, dimensions);
        const b = stableHashVector(right, dimensions);
        const dot = a.reduce((sum, value, index) => sum + value * b[index], 0);
        const normA = Math.sqrt(
          a.reduce((sum, value) => sum + value * value, 0),
        );
        const normB = Math.sqrt(
          b.reduce((sum, value) => sum + value * value, 0),
        );
        return Number((dot / ((normA || 1) * (normB || 1))).toFixed(6));
      },
    }),
  });

  return createServicePlugin(
    "local-embedding",
    "Official-style local embedding plugin for offline Eliza Agent vector operations.",
    LocalEmbeddingService,
  );
}

export default createLocalEmbeddingPlugin;
