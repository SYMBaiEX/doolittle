import type {
  IAgentRuntime,
  Metadata,
  MetadataValue,
  Plugin,
  Relationship,
} from "@elizaos/core";
import officialSqlPlugin from "@elizaos-official/plugin-sql";

type LegacySqlAdapter = {
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

const DEFAULT_MEMORY_TABLE = "messages";

function normalizeRelationshipTags(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return Array.from(
      new Set(
        tags
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    );
  }

  if (tags instanceof Set) {
    return normalizeRelationshipTags(Array.from(tags));
  }

  if (
    tags &&
    typeof tags === "object" &&
    typeof (tags as Iterable<unknown>)[Symbol.iterator] === "function"
  ) {
    return normalizeRelationshipTags(Array.from(tags as Iterable<unknown>));
  }

  return [];
}

function toMetadataValue(value: unknown): MetadataValue {
  if (
    value == null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toMetadataValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toMetadataValue(item)]),
    );
  }

  return String(value);
}

function normalizeRelationshipMetadata(metadata: unknown): Metadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      toMetadataValue(value),
    ]),
  );
}

function mergeRelationshipMetadata(
  existing: unknown,
  incoming: unknown,
): Metadata {
  return {
    ...normalizeRelationshipMetadata(existing),
    ...normalizeRelationshipMetadata(incoming),
  };
}

function getRuntimeDatabaseAdapter(
  runtime: IAgentRuntime,
): LegacySqlAdapter | undefined {
  const runtimeWithAdapter = runtime as IAgentRuntime & {
    getDatabaseAdapter?: () => unknown;
    databaseAdapter?: unknown;
    adapter?: unknown;
  };

  return (
    (runtimeWithAdapter.getDatabaseAdapter?.() as
      | LegacySqlAdapter
      | undefined) ??
    (runtimeWithAdapter.databaseAdapter as LegacySqlAdapter | undefined) ??
    (runtimeWithAdapter.adapter as LegacySqlAdapter | undefined)
  );
}

function patchDatabaseAdapter(runtime: IAgentRuntime): void {
  const adapter = getRuntimeDatabaseAdapter(runtime);
  if (!adapter) {
    return;
  }

  if (!adapter.__elizaAgentCountMemoriesPatched) {
    const originalGetMemories = adapter.getMemories?.bind(adapter);
    if (originalGetMemories) {
      adapter.getMemories = (params) =>
        originalGetMemories({
          ...params,
          tableName: params.tableName || DEFAULT_MEMORY_TABLE,
        });
    }

    const originalCountMemories = adapter.countMemories?.bind(adapter);
    if (originalCountMemories) {
      adapter.countMemories = async (roomIdOrParams, unique, tableName) => {
        if (
          roomIdOrParams &&
          typeof roomIdOrParams === "object" &&
          !Array.isArray(roomIdOrParams)
        ) {
          const params = roomIdOrParams as {
            roomId?: string;
            roomIds?: string[];
            unique?: boolean;
            tableName?: string;
          };
          const roomIds = Array.isArray(params.roomIds)
            ? params.roomIds.filter((value): value is string => Boolean(value))
            : params.roomId
              ? [params.roomId]
              : [];
          if (roomIds.length === 0) {
            return 0;
          }

          const counts = await Promise.all(
            roomIds.map((roomId) =>
              originalCountMemories(
                roomId,
                params.unique,
                params.tableName || DEFAULT_MEMORY_TABLE,
              ),
            ),
          );

          return counts.reduce(
            (sum: number, value) =>
              sum + (typeof value === "number" ? value : Number(value) || 0),
            0,
          );
        }

        return originalCountMemories(
          roomIdOrParams,
          unique,
          tableName || DEFAULT_MEMORY_TABLE,
        );
      };
    }

    adapter.__elizaAgentCountMemoriesPatched = true;
  }

  if (!adapter.__elizaAgentRelationshipCompatibilityPatched) {
    const originalGetRelationships = adapter.getRelationships?.bind(adapter);
    if (originalGetRelationships) {
      adapter.getRelationships = async (params) => {
        const candidates = [
          params.entityId,
          Array.isArray(params.entityIds) ? params.entityIds[0] : undefined,
          params.sourceEntityId,
          params.targetEntityId,
        ];
        const entityId = candidates
          .find(
            (value): value is string =>
              typeof value === "string" && value.trim().length > 0,
          )
          ?.trim();

        if (!entityId) {
          return [];
        }

        return originalGetRelationships({
          ...params,
          entityId,
          entityIds: undefined,
          sourceEntityId: undefined,
          targetEntityId: undefined,
        });
      };
    }
    adapter.__elizaAgentRelationshipCompatibilityPatched = true;
  }

  if (adapter.__elizaAgentRelationshipWriteCompatibilityPatched) {
    return;
  }

  const originalCreateRelationship = adapter.createRelationship?.bind(adapter);
  const originalGetRelationship = adapter.getRelationship?.bind(adapter);
  const originalUpdateRelationship = adapter.updateRelationship?.bind(adapter);
  if (
    originalCreateRelationship &&
    originalGetRelationship &&
    originalUpdateRelationship
  ) {
    adapter.createRelationship = async (params) => {
      const sourceEntityId = params.sourceEntityId?.trim();
      const targetEntityId = params.targetEntityId?.trim();
      if (!sourceEntityId || !targetEntityId) {
        return false;
      }

      const nextTags = normalizeRelationshipTags(params.tags);
      const nextMetadata = normalizeRelationshipMetadata(params.metadata);

      const mergeIntoExisting = async (
        existing: Relationship | null,
      ): Promise<boolean> => {
        if (!existing) {
          return false;
        }
        await originalUpdateRelationship({
          ...existing,
          tags: Array.from(
            new Set([...normalizeRelationshipTags(existing.tags), ...nextTags]),
          ),
          metadata: mergeRelationshipMetadata(existing.metadata, nextMetadata),
        });
        return true;
      };

      if (
        await mergeIntoExisting(
          await originalGetRelationship({
            sourceEntityId,
            targetEntityId,
          }),
        )
      ) {
        return true;
      }

      const created = await originalCreateRelationship({
        ...params,
        sourceEntityId,
        targetEntityId,
        tags: nextTags,
        metadata: nextMetadata,
      });
      if (created) {
        return true;
      }

      return mergeIntoExisting(
        await originalGetRelationship({
          sourceEntityId,
          targetEntityId,
        }),
      );
    };
  }
  adapter.__elizaAgentRelationshipWriteCompatibilityPatched = true;
}

export const __testing = {
  patchDatabaseAdapter,
  normalizeRelationshipTags,
  normalizeRelationshipMetadata,
  mergeRelationshipMetadata,
};

const plugin: Plugin = {
  ...officialSqlPlugin,
  name: "@elizaos/plugin-sql",
  description:
    "Workspace-native SQL plugin aligned with Eliza Agent's core/runtime contract.",
  async init(config, runtime) {
    await officialSqlPlugin.init?.(config, runtime);
    patchDatabaseAdapter(runtime);
  },
};

export default plugin;
