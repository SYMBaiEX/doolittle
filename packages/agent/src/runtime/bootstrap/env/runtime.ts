import {
  getPgliteDataDir,
  preparePgliteRuntime,
} from "@/runtime/bootstrap/env/pglite";
import { ensureSecretSalt } from "@/runtime/bootstrap/env/secret-salt";
import type { EnvConfig } from "@/types/runtime";

export function bootstrapRuntimeEnvironment(config: EnvConfig): void {
  process.env.LOG_LEVEL ||= "error";
  process.env.DEFAULT_LOG_LEVEL ||= process.env.LOG_LEVEL;
  const stableSecretSalt = ensureSecretSalt(config);
  process.env.SECRET_SALT ||= stableSecretSalt;
  process.env.ENCRYPTION_SALT ||= stableSecretSalt;
  process.env.PGLITE_DATA_DIR ||= getPgliteDataDir(config);
  preparePgliteRuntime(config);
}
