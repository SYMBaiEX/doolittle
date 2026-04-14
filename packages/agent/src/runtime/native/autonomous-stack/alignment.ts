import type { EnvConfig } from "@/types/runtime";
import { summarizeAutonomousConnection } from "./connection-summary";
import {
  autonomousFoundationPackages,
  autonomousNativeControlPlanes,
  autonomousPatternAreas,
} from "./constants";
import { buildAutonomousCompatSnapshot } from "./snapshot";

export function describeAutonomousAlignment(config?: EnvConfig) {
  const snapshot = buildAutonomousCompatSnapshot(config);

  return {
    foundationPackages: [...autonomousFoundationPackages],
    patternAreas: [...autonomousPatternAreas],
    nativeControlPlanes: [...autonomousNativeControlPlanes],
    pluginAutoEnable: snapshot?.pluginAutoEnable ?? {
      allow: [],
      changes: [],
    },
    connection: summarizeAutonomousConnection(config),
  };
}
