import {
  type ClaudeCodeAuthDependencies,
  getClaudeCodeAuthDependencies,
} from "../claude-code-support";
import type {
  LinkedClaudeCodeCredentials,
  LinkedProviderAccountStatus,
} from "../types";
import { getLinkedClaudeCodeCredentials as getLinkedClaudeCodeCredentialsImpl } from "./credentials";
import { refreshLinkedClaudeCodeCredentials as refreshLinkedClaudeCodeCredentialsImpl } from "./refresh";
import { getClaudeCodeAccountStatus as getClaudeCodeAccountStatusImpl } from "./status";

export function getClaudeCodeAccountStatus(
  homePath?: string,
  deps: ClaudeCodeAuthDependencies = getClaudeCodeAuthDependencies(),
): LinkedProviderAccountStatus {
  return getClaudeCodeAccountStatusImpl(homePath, deps);
}

export function getLinkedClaudeCodeCredentials(
  homePath?: string,
  deps: ClaudeCodeAuthDependencies = getClaudeCodeAuthDependencies(),
): LinkedClaudeCodeCredentials | undefined {
  return getLinkedClaudeCodeCredentialsImpl(homePath, deps);
}

export async function refreshLinkedClaudeCodeCredentials(
  homePath?: string,
  deps: ClaudeCodeAuthDependencies = getClaudeCodeAuthDependencies(),
): Promise<LinkedClaudeCodeCredentials | undefined> {
  return refreshLinkedClaudeCodeCredentialsImpl(homePath, deps);
}
