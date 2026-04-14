import type { NativeCapabilityTruthRecord } from "../../packages/agent/src/runtime/native/capability-truth";

export interface PluginInventoryRow {
  id: string;
  packageName: string;
  category: string;
  kind: string;
  maturity: string;
  persistence: string;
  source: string;
  workspacePath: string;
  owner: string;
  publishIntent: string;
  tests: string;
  notes: string;
}

export interface PluginReadmeTarget {
  path: string;
  id: NativeCapabilityTruthRecord["id"];
}

export type SyncMode = "write" | "check";
