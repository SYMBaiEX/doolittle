import { existsSync } from "node:fs";
import { join } from "node:path";
import type { EnvConfig } from "../../../types/runtime/index";

export function getPgliteDataDir(
  config: EnvConfig,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.PGLITE_DATA_DIR?.trim() || join(config.dataDir, "pglite");
}

export function pgliteRepairDirectory(dataDir: string): string {
  return `${dataDir}.repair-in-progress`;
}

export function assertPgliteRepairIdle(dataDir: string): void {
  if (existsSync(pgliteRepairDirectory(dataDir))) {
    throw new Error(
      `Local database maintenance is in progress. If interrupted, inspect ${pgliteRepairDirectory(dataDir)} before starting the runtime.`,
    );
  }
}
