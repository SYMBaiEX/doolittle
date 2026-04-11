import type { Relationship } from "@elizaos/core";

export type LegacySqlAdapter = {
  __elizaAgentCountMemoriesPatched?: boolean;
  __elizaAgentRelationshipCompatibilityPatched?: boolean;
  __elizaAgentRelationshipWriteCompatibilityPatched?: boolean;
  getMemories?: (
    params: { tableName?: string } & Record<string, unknown>,
  ) => Promise<unknown>;
  countMemories?: (
    roomIdOrParams: string | ({ tableName?: string } & Record<string, unknown>),
    unique?: boolean,
    tableName?: string,
  ) => Promise<unknown>;
  getRelationships?: (
    params: {
      entityId?: string;
      entityIds?: string[];
      sourceEntityId?: string;
      targetEntityId?: string;
      tags?: string[];
      limit?: number;
      offset?: number;
    } & Record<string, unknown>,
  ) => Promise<unknown>;
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
