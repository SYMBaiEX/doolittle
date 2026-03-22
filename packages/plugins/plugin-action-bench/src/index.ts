import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "@elizaos/core";

interface BenchmarkPackRecord {
  id?: string;
  recommendedCommands?: string[];
}

function repoRoot(): string {
  return join(import.meta.dir, "..", "..", "..", "..");
}

function readPack(fileName: string): BenchmarkPackRecord | undefined {
  try {
    return JSON.parse(
      readFileSync(
        join(repoRoot(), "packages", "benchmarks", "packs", fileName),
        "utf8",
      ),
    ) as BenchmarkPackRecord;
  } catch {
    return undefined;
  }
}

function countSuites(record: BenchmarkPackRecord | undefined): number {
  return Array.isArray(record?.recommendedCommands)
    ? record.recommendedCommands.length
    : 0;
}

const coreRuntimePack = readPack("core-runtime.json");
const gatewayDaemonPack = readPack("gateway-daemon.json");

export const benchmarkConfig = {
  totalActionsLoaded:
    countSuites(coreRuntimePack) + countSuites(gatewayDaemonPack),
  typewriterEnabled: true,
  multiverseMathEnabled: true,
  relationalDataEnabled: true,
  packs: [
    {
      id: coreRuntimePack?.id ?? "core-runtime",
      suites: countSuites(coreRuntimePack),
    },
    {
      id: gatewayDaemonPack?.id ?? "gateway-daemon",
      suites: countSuites(gatewayDaemonPack),
    },
  ],
} as const;

export const actionBenchPlugin: Plugin = {
  name: "@elizaos/plugin-action-bench",
  description:
    "Workspace-native benchmark plugin exposing action-bench pack coverage on the Eliza Agent runtime line.",
  services: [],
  providers: [],
  evaluators: [],
  actions: [],
};
