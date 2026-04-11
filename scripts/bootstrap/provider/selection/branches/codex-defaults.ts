export interface CodexBondAccounts {
  codex: {
    nativeReady?: boolean;
  };
}

export function resolveCodexBondDefault(
  linkedAccounts: CodexBondAccounts,
): "login" | "skip" {
  return linkedAccounts.codex.nativeReady ? "skip" : "login";
}
