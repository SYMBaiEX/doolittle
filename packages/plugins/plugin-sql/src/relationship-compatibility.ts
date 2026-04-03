import type { Relationship } from "@elizaos/core";
import type { LegacySqlAdapter } from "./adapter-types";
import {
  mergeRelationshipMetadata,
  normalizeRelationshipMetadata,
  normalizeRelationshipTags,
} from "./metadata-normalization";

export function patchRelationshipGetCompatibility(
  adapter: LegacySqlAdapter,
): void {
  if (adapter.__elizaAgentRelationshipCompatibilityPatched) {
    return;
  }

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

export function patchRelationshipWriteCompatibility(
  adapter: LegacySqlAdapter,
): void {
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
