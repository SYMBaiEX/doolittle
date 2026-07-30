import type { IAgentRuntime } from "@elizaos/core";
import { getRuntimeDatabaseAdapter } from "./adapter-access";
import { patchRelationshipWriteCompatibility } from "./relationship-compatibility";

export function patchDatabaseAdapter(runtime: IAgentRuntime): void {
  const adapter = getRuntimeDatabaseAdapter(runtime);
  if (!adapter) {
    return;
  }

  // beta.7's official adapter owns memory counting and relationship reads.
  // Keep only Doolittle's product-specific relationship write projection.
  patchRelationshipWriteCompatibility(adapter);
}
