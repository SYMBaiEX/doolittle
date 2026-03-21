import type {} from "@elizaos/agent";
import type {} from "@elizaos/autonomous";
import type {} from "@elizaos/skills";

export const autonomousFoundationPackages = [
  "@elizaos/agent",
  "@elizaos/autonomous",
  "@elizaos/skills",
] as const;

export const autonomousPatternAreas = [
  "skills-runtime-wiring",
  "agent-orchestration",
  "coding-agent-integration",
  "trajectory-logging",
  "plugin-centric-runtime-assembly",
] as const;

export function describeAutonomousAlignment() {
  return {
    foundationPackages: [...autonomousFoundationPackages],
    patternAreas: [...autonomousPatternAreas],
  };
}
