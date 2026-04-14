import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { listNativeCapabilityTruth } from "../../packages/agent/src/runtime/native/capability-truth";
import { buildInventoryRows } from "./inventory";
import {
  renderCapabilityTruth,
  renderPluginInventory,
  renderPluginReadme,
} from "./render";
import { pluginReadmeTargets } from "./targets";
import type { SyncMode } from "./types";

function syncFile(
  root: string,
  mode: SyncMode,
  path: string,
  expected: string,
) {
  const absolute = join(root, path);
  const current = existsSync(absolute) ? readFileSync(absolute, "utf8") : null;
  if (current === expected) {
    return null;
  }

  if (mode === "write") {
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, expected, "utf8");
    return null;
  }

  return path;
}

export function runSyncDocTruth(options?: { root?: string; mode?: SyncMode }) {
  const root = options?.root ?? process.cwd();
  const mode = options?.mode ?? "check";
  const inventoryRows = buildInventoryRows(root);
  const capabilityTruth = listNativeCapabilityTruth();
  const inventoryById = new Map(inventoryRows.map((row) => [row.id, row]));
  const failures = [
    syncFile(
      root,
      mode,
      "docs/plugin-inventory.md",
      renderPluginInventory(inventoryRows),
    ),
    syncFile(
      root,
      mode,
      "docs/capability-truth.md",
      renderCapabilityTruth(capabilityTruth),
    ),
  ].filter(Boolean) as string[];

  for (const target of pluginReadmeTargets) {
    const row = inventoryById.get(target.id);
    const truth = capabilityTruth.find((entry) => entry.id === target.id);
    if (!row || !truth) {
      failures.push(target.path);
      continue;
    }
    const failure = syncFile(
      root,
      mode,
      target.path,
      renderPluginReadme(row, truth),
    );
    if (failure) {
      failures.push(failure);
    }
  }

  return failures;
}
