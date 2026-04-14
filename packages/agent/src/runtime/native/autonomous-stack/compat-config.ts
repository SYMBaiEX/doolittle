import type { EnvConfig } from "@/types/runtime";
import { createAutonomousCompatConfig } from "./snapshot";

export function buildAutonomousCompatConfig(
  config: EnvConfig,
): Record<string, unknown> {
  return createAutonomousCompatConfig(config);
}
