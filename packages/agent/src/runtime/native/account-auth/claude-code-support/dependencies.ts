import { createTokenProviderAuthDependencies } from "../provider-support";
import {
  getStoredClaudeCodeCredentials as getStoredClaudeCodeCredentialsFromStore,
  persistProviderCredentials as persistProviderCredentialsForProvider,
} from "../store";
import type { LinkedClaudeCodeCredentials } from "../types";

export type ClaudeCodeAuthDependencies = ReturnType<
  typeof getClaudeCodeAuthDependencies
>;

export function getClaudeCodeAuthDependencies() {
  const base = createTokenProviderAuthDependencies<LinkedClaudeCodeCredentials>(
    "claude-code",
    getStoredClaudeCodeCredentialsFromStore,
  );
  return {
    ...base,
    getStoredClaudeCodeCredentials: base.getStoredCredentials,
    persistProviderCredentials: base.persistCredentials,
  };
}

export function persistProviderCredentials(
  credentials: LinkedClaudeCodeCredentials | undefined,
): void {
  persistProviderCredentialsForProvider("claude-code", credentials);
}

export function getStoredClaudeCodeCredentials():
  | LinkedClaudeCodeCredentials
  | undefined {
  return getStoredClaudeCodeCredentialsFromStore();
}
