import type { IAgentRuntime } from "@elizaos/core";
import { getRuntimeDatabaseAdapter } from "./adapter-access";
import { patchMemoryCountingAdapter } from "./memory-counting-patching";
import {
  patchRelationshipGetCompatibility,
  patchRelationshipWriteCompatibility,
} from "./relationship-compatibility";

export function patchDatabaseAdapter(runtime: IAgentRuntime): void {
  const adapter = getRuntimeDatabaseAdapter(runtime);
  if (!adapter) {
    return;
  }

  patchMemoryCountingAdapter(adapter);
  patchRelationshipGetCompatibility(adapter);
  patchRelationshipWriteCompatibility(adapter);
}
