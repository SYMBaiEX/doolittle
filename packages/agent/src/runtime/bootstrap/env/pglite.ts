import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { reconcilePglitePidFile } from "@/runtime/bootstrap/recovery/pid-file";
import type { EnvConfig } from "@/types/runtime";

export function getPgliteDataDir(
  config: EnvConfig,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.PGLITE_DATA_DIR?.trim() || join(config.dataDir, "pglite");
}

export function preparePgliteRuntime(
  config: EnvConfig,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const pgliteDataDir = getPgliteDataDir(config, env);
  mkdirSync(pgliteDataDir, { recursive: true });
  reconcilePglitePidFile(pgliteDataDir);
}
