import { createTokenProviderAuthDependencies } from "./provider-support";
import { getStoredCodexCredentials } from "./store";
import type { LinkedCodexCredentials } from "./types";

export type CodexAuthDependencies = ReturnType<typeof getCodexAuthDependencies>;

export function getCodexAuthDependencies() {
  const base = createTokenProviderAuthDependencies<LinkedCodexCredentials>(
    "codex",
    getStoredCodexCredentials,
  );
  return {
    ...base,
    getStoredCodexCredentials: base.getStoredCredentials,
    persistProviderCredentials: (
      provider: "codex",
      credentials: LinkedCodexCredentials | undefined,
    ) => {
      if (provider === "codex") {
        base.persistCredentials(credentials);
      }
    },
  };
}
