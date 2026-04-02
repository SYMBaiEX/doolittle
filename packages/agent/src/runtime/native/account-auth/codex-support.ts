import {
  commandExists,
  DEFAULT_REFRESH_SKEW_SECONDS,
  decodeJwtPayload,
  isUnixSecondsExpiring,
  readCommandText,
  readJson,
  resolveHome,
  writeJson,
} from "./shared";
import { persistProviderCredentials, readProviderAuthStore } from "./store";
import type { LinkedCodexCredentials } from "./types";

export function getCodexAuthDependencies() {
  return {
    defaultRefreshSkewSeconds: DEFAULT_REFRESH_SKEW_SECONDS,
    resolveHome,
    commandExists,
    readCommandText,
    readJson,
    writeJson,
    readProviderAuthStore,
    persistProviderCredentials: (
      provider: "codex",
      credentials: LinkedCodexCredentials | undefined,
    ) => persistProviderCredentials(provider, credentials),
    decodeJwtPayload,
    isUnixSecondsExpiring,
  };
}
