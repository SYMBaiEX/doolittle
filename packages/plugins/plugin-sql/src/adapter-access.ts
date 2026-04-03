import type { IAgentRuntime } from "@elizaos/core";
import type { LegacySqlAdapter } from "./adapter-types";

type RuntimeDatabaseAdapterCarrier = IAgentRuntime & {
  getDatabaseAdapter?: () => unknown;
  databaseAdapter?: unknown;
  adapter?: unknown;
};

export function getRuntimeDatabaseAdapter(
  runtime: IAgentRuntime,
): LegacySqlAdapter | undefined {
  const runtimeWithAdapter = runtime as RuntimeDatabaseAdapterCarrier;

  return (
    (runtimeWithAdapter.getDatabaseAdapter?.() as
      | LegacySqlAdapter
      | undefined) ??
    (runtimeWithAdapter.databaseAdapter as LegacySqlAdapter | undefined) ??
    (runtimeWithAdapter.adapter as LegacySqlAdapter | undefined)
  );
}
