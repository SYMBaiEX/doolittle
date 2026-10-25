import { readWorkerBotProfile } from "../runtime/bootstrap/bot-profile";
import {
  currentConversationWorkspace,
  isDesktopWorkspaceRuntime,
} from "../runtime/workspace-scope";

export type WorkspaceDirectorySource = string | (() => string);

export function resolveWorkspaceDirectory(
  source: WorkspaceDirectorySource,
): string {
  const scope = currentConversationWorkspace();
  if (scope) return scope.workspacePath;
  if (isDesktopWorkspaceRuntime() || readWorkerBotProfile()) {
    throw new Error("A bound conversation workspace is required.");
  }
  return typeof source === "function" ? source() : source;
}
