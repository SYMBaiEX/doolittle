import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";

import { stableHashVector } from "./hash";

export function createLocalEmbeddingPlugin(): Plugin {
  class LocalEmbeddingService extends ElizaService {
    static serviceType = "local_embedding";
    capabilityDescription =
      "Official-style local embedding service using deterministic offline vectors.";

    static async start(_runtime: IAgentRuntime): Promise<ElizaService> {
      return new LocalEmbeddingService(_runtime);
    }

    async stop(): Promise<void> {
      return;
    }

    embed(text: string, dimensions = 16) {
      return stableHashVector(text, dimensions);
    }

    similarity(left: string, right: string, dimensions = 16) {
      const a = stableHashVector(left, dimensions);
      const b = stableHashVector(right, dimensions);
      const dot = a.reduce((sum, value, index) => sum + value * b[index], 0);
      const normA = Math.sqrt(a.reduce((sum, value) => sum + value * value, 0));
      const normB = Math.sqrt(b.reduce((sum, value) => sum + value * value, 0));
      return Number((dot / ((normA || 1) * (normB || 1))).toFixed(6));
    }
  }

  return {
    name: "local-embedding",
    description:
      "Official-style local embedding plugin for offline Eliza Agent vector operations.",
    services: [LocalEmbeddingService],
  };
}

export default createLocalEmbeddingPlugin;
