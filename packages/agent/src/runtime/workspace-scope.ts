import { AsyncLocalStorage } from "node:async_hooks";
import { realpathSync } from "node:fs";
import { isAbsolute } from "node:path";
import { requestWorkerHost } from "@/runtime/bootstrap/worker-host-rpc";

export interface ConversationWorkspaceScope {
  sessionId: string;
  botId: string;
  workspacePath: string;
  projectId?: string;
  projectContext?: {
    name: string;
    description?: string;
    instructions?: string;
  };
}

interface ActiveWorkspaceScope {
  value: ConversationWorkspaceScope;
  active: boolean;
}

const scopes = new AsyncLocalStorage<ActiveWorkspaceScope>();

export function isDesktopWorkspaceRuntime(): boolean {
  return process.env.DOOLITTLE_DESKTOP_RUNTIME === "1";
}

export function currentConversationWorkspace():
  | ConversationWorkspaceScope
  | undefined {
  const scope = scopes.getStore();
  if (!scope) return undefined;
  if (!scope.active)
    throw new Error("The conversation workspace scope has ended.");
  return scope.value;
}

export function requireConversationWorkspace(): ConversationWorkspaceScope {
  const scope = currentConversationWorkspace();
  if (!scope) throw new Error("A bound conversation workspace is required.");
  return scope;
}

export async function resolveConversationWorkspace(
  sessionId: string,
  signal?: AbortSignal,
  acpSessionId?: string,
): Promise<ConversationWorkspaceScope> {
  if (!sessionId || sessionId.length > 256) {
    throw new Error("A valid conversation identity is required.");
  }
  const raw = await requestWorkerHost(
    "workspace.resolve",
    { sessionId, ...(acpSessionId ? { acpSessionId } : {}) },
    {
      timeoutMs: 15_000,
      signal,
    },
  );
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("The conversation workspace scope is unavailable.");
  }
  const value = raw as Record<string, unknown>;
  if (
    value.sessionId !== sessionId ||
    typeof value.botId !== "string" ||
    !value.botId ||
    typeof value.workspacePath !== "string" ||
    !isAbsolute(value.workspacePath) ||
    (value.projectId !== undefined && typeof value.projectId !== "string")
  ) {
    throw new Error("The conversation workspace scope is invalid.");
  }
  const workspacePath = realpathSync(value.workspacePath);
  if (workspacePath !== value.workspacePath) {
    throw new Error("The conversation workspace root changed.");
  }
  const project = value.projectContext;
  if (
    project !== undefined &&
    (!project ||
      typeof project !== "object" ||
      Array.isArray(project) ||
      typeof (project as Record<string, unknown>).name !== "string")
  ) {
    throw new Error("The conversation project context is invalid.");
  }
  const projectContext =
    project as ConversationWorkspaceScope["projectContext"];
  return {
    sessionId,
    botId: value.botId,
    workspacePath,
    ...(typeof value.projectId === "string"
      ? { projectId: value.projectId }
      : {}),
    ...(projectContext ? { projectContext } : {}),
  };
}

export async function runWithConversationWorkspace<T>(
  scope: ConversationWorkspaceScope,
  task: () => Promise<T>,
): Promise<T> {
  const active: ActiveWorkspaceScope = { value: scope, active: true };
  try {
    return await scopes.run(active, task);
  } finally {
    active.active = false;
  }
}
