import { realpathSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import type { AppContext } from "@/runtime/bootstrap";
import { readWorkerBotProfile } from "@/runtime/bootstrap/bot-profile";
import {
  currentConversationWorkspace,
  isDesktopWorkspaceRuntime,
} from "@/runtime/workspace-scope";
import { readJsonObjectBody } from "@/server/request-body";
import { json } from "@/server/responses";
import { hasDesktopControlCapability } from "../workspace-scope";

const MAX_WORKSPACE_PATH_LENGTH = 4_096;

export function resolveRuntimeWorkspacePath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_WORKSPACE_PATH_LENGTH ||
    value !== value.trim() ||
    !isAbsolute(value) ||
    Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
    })
  ) {
    throw new Error("workspaceDir must be a valid absolute directory path.");
  }

  let canonicalPath: string;
  try {
    canonicalPath = realpathSync(value);
  } catch {
    throw new Error("The selected workspace does not exist.");
  }
  if (!statSync(canonicalPath).isDirectory()) {
    throw new Error("The selected workspace is not a directory.");
  }
  return canonicalPath;
}

export function switchRuntimeWorkspace(
  context: AppContext,
  value: unknown,
): string {
  if (readWorkerBotProfile() || currentConversationWorkspace()) {
    throw new Error(
      "Bound conversation workspaces cannot be switched by the runtime API.",
    );
  }
  const workspaceDir = resolveRuntimeWorkspacePath(value);
  if (context.config.workspaceDir === workspaceDir) {
    return workspaceDir;
  }

  if (context.services.runController.workspaceSwitchConflict(workspaceDir)) {
    throw new RuntimeWorkspaceConflictError();
  }

  const repository = context.services.repository;
  const terminal = context.services.terminal;
  const skills = context.services.skills;
  context.config.workspaceDir = workspaceDir;
  repository.invalidateWorkspace();
  terminal.invalidateWorkspace();
  skills.invalidateWorkspace();
  return workspaceDir;
}

export class RuntimeWorkspaceConflictError extends Error {
  readonly code = "workspace_busy";

  constructor() {
    super(
      "Wait for the active agent run to finish or cancel it before changing workspaces.",
    );
    this.name = "RuntimeWorkspaceConflictError";
  }
}

export async function handleRuntimeWorkspaceRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method !== "POST" || url.pathname !== "/runtime/workspace") {
    return null;
  }
  if (isDesktopWorkspaceRuntime() && !hasDesktopControlCapability(request)) {
    return json(
      { error: "Operator workspace navigation requires host approval." },
      403,
    );
  }

  const parsed = await readJsonObjectBody(request);
  if (!parsed.ok) {
    return json(
      {
        error:
          parsed.reason === "invalid_json"
            ? "Invalid JSON body"
            : "JSON body must be an object",
      },
      400,
    );
  }
  try {
    const workspaceDir = switchRuntimeWorkspace(
      context,
      parsed.value.workspaceDir,
    );
    return json({
      workspaceDir,
      processId: process.pid,
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The workspace could not be changed.",
        ...(error instanceof RuntimeWorkspaceConflictError
          ? { code: error.code }
          : {}),
      },
      error instanceof RuntimeWorkspaceConflictError ? 409 : 400,
    );
  }
}
