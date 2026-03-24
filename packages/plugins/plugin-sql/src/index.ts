import type { IAgentRuntime, Plugin } from "@elizaos/core";
import officialSqlPlugin from "@elizaos-official/plugin-sql";

type LegacySqlAdapter = {
  __elizaAgentCountMemoriesPatched?: boolean;
  getMemories?: (
    params: { tableName?: string } & Record<string, unknown>,
  ) => Promise<unknown>;
  countMemories?: (
    roomIdOrParams: string | ({ tableName?: string } & Record<string, unknown>),
    unique?: boolean,
    tableName?: string,
  ) => Promise<unknown>;
};

const DEFAULT_MEMORY_TABLE = "messages";

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
  if (!adapter || adapter.__elizaAgentCountMemoriesPatched) {
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
