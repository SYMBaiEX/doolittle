import { join } from "node:path";
import type { EnvConfig } from "../../../types/runtime/index";

export function getPgliteDataDir(
  config: EnvConfig,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.PGLITE_DATA_DIR?.trim() || join(config.dataDir, "pglite");
}
