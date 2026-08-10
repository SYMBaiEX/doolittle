import type { IAgentRuntime } from "@elizaos/core";
import { getRuntimeDatabaseAdapter } from "./adapter-access";
import { patchRelationshipWriteCompatibility } from "./relationship-compatibility";

export function patchDatabaseAdapter(runtime: IAgentRuntime): void {
  const adapter = getRuntimeDatabaseAdapter(runtime);
  if (!adapter) {
    return;
  }

  // The official adapter owns persistence and relationship reads. Keep only
  // Doolittle's product-specific merge-on-write projection.
  patchRelationshipWriteCompatibility(adapter);
}
