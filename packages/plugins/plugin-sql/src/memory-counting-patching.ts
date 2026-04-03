import type { LegacySqlAdapter } from "./adapter-types";
import { DEFAULT_MEMORY_TABLE } from "./constants";

export function patchMemoryCountingAdapter(adapter: LegacySqlAdapter): void {
  if (adapter.__elizaAgentCountMemoriesPatched) {
    return;
  }

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
