import { realpathSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";

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
  const workspaceDir = resolveRuntimeWorkspacePath(value);
  if (context.config.workspaceDir === workspaceDir) {
    return workspaceDir;
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

export async function handleRuntimeWorkspaceRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method !== "POST" || url.pathname !== "/runtime/workspace") {
    return null;
  }

  const body = (await request.json().catch(() => null)) as {
    workspaceDir?: unknown;
  } | null;
  try {
    const workspaceDir = switchRuntimeWorkspace(context, body?.workspaceDir);
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
      },
      400,
    );
  }
}
