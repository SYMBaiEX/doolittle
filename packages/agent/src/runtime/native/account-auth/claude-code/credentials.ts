import {
  type ClaudeCodeAuthDependencies,
  readClaudeCodeFileCredentials,
  resolveClaudeCodeEnvCredentials,
} from "../claude-code-support";
import {
  persistResolvedTokenCredentials,
  resolveStoredOrLoadedTokenCredentials,
} from "../credentials";
import type { LinkedClaudeCodeCredentials } from "../types";

export function getLinkedClaudeCodeCredentials(
  homePath: string | undefined,
  deps: ClaudeCodeAuthDependencies,
): LinkedClaudeCodeCredentials | undefined {
  return resolveStoredOrLoadedTokenCredentials({
    stored: deps.getStoredCredentials(),
    loaded:
      readClaudeCodeFileCredentials(homePath, deps) ||
      resolveClaudeCodeEnvCredentials(homePath, deps),
    persistCredentials: deps.persistCredentials,
  });
}

export function persistLinkedClaudeCodeCredentials(
  credentials: LinkedClaudeCodeCredentials | undefined,
  deps: ClaudeCodeAuthDependencies,
): LinkedClaudeCodeCredentials | undefined {
  return persistResolvedTokenCredentials(credentials, deps.persistCredentials);
}
