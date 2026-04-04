import type { AgentRuntime, Relationship, UUID } from "@elizaos/core";

type RuntimeRelationshipParams = Parameters<
  AgentRuntime["getRelationships"]
>[0] & {
  entityIds?: UUID[];
};

type RuntimeRelationshipResult = Awaited<
  ReturnType<AgentRuntime["getRelationships"]>
>;

export function coerceRelationshipEntityId(
  params: unknown,
): string | undefined {
  if (!params || typeof params !== "object") {
    return undefined;
  }

  const record = params as {
    entityId?: unknown;
    entityIds?: unknown;
    sourceEntityId?: unknown;
    targetEntityId?: unknown;
  };

  for (const candidate of [
    record.entityId,
    record.sourceEntityId,
    record.targetEntityId,
  ]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  if (!Array.isArray(record.entityIds)) {
    return undefined;
  }

  const firstEntityId = record.entityIds.find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );
  return firstEntityId?.trim();
}

export function patchRuntimeRelationshipCompatibility(
  runtime: AgentRuntime,
): void {
  const runtimeWithPatch = runtime as AgentRuntime & {
    __elizaAgentRelationshipCompatibilityPatched?: boolean;
  };
  if (
    runtimeWithPatch.__elizaAgentRelationshipCompatibilityPatched ||
    typeof runtimeWithPatch.getRelationships !== "function"
  ) {
    return;
  }

  const originalGetRelationships =
    runtimeWithPatch.getRelationships.bind(runtimeWithPatch);
  const patchedGetRelationships: AgentRuntime["getRelationships"] = async (
    params,
  ): Promise<Relationship[]> => {
    const runtimeParams = params as RuntimeRelationshipParams;
    const entityId = coerceRelationshipEntityId(params);
    if (!entityId) {
      if (Array.isArray(runtimeParams.entityIds)) {
        return [] satisfies RuntimeRelationshipResult;
      }
      return originalGetRelationships(params);
    }

    const normalizedParams: Parameters<AgentRuntime["getRelationships"]>[0] = {
      ...runtimeParams,
      entityId: entityId as UUID,
    };
    return originalGetRelationships(normalizedParams);
  };

  runtimeWithPatch.getRelationships = patchedGetRelationships;
  runtimeWithPatch.__elizaAgentRelationshipCompatibilityPatched = true;
}
