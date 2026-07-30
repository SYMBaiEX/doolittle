import type { Relationship } from "@elizaos/core";

export type LegacySqlAdapter = {
  __elizaAgentRelationshipWriteCompatibilityPatched?: boolean;
  createRelationship?: (params: {
    sourceEntityId: string;
    targetEntityId: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }) => Promise<boolean>;
  getRelationship?: (params: {
    sourceEntityId: string;
    targetEntityId: string;
  }) => Promise<Relationship | null>;
  updateRelationship?: (relationship: Relationship) => Promise<void>;
};
