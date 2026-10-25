import type { EnvConfig } from "../../../types/runtime/index";
import { getPgliteDataDir, preparePgliteRuntime } from "./pglite";
import { ensureSecretSalt } from "./secret-salt";

export function bootstrapRuntimeEnvironment(config: EnvConfig): void {
  process.env.LOG_LEVEL ||= "error";
  process.env.DEFAULT_LOG_LEVEL ||= process.env.LOG_LEVEL;
  const stableSecretSalt = ensureSecretSalt(config);
  process.env.SECRET_SALT ||= stableSecretSalt;
  process.env.ENCRYPTION_SALT ||= stableSecretSalt;
  process.env.PGLITE_DATA_DIR ||= getPgliteDataDir(config);
  preparePgliteRuntime(config);
}
