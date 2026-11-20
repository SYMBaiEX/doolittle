import type { ComputerOrigin } from "./computer-origin";

export type DesktopNavigationIntent =
  | {
      id: string;
      kind: "workspace-file";
      target: { path: string; origin: ComputerOrigin };
    }
  | {
      id: string;
      kind: "orchestration-task";
      target: { taskId: string };
    }
  | {
      id: string;
      kind: "project-source";
      target: { projectId: string; resourceId: string };
    }
  | {
      id: string;
      kind: "runtime-log";
      target: { logId: string; query: string };
    };

export function createWorkspaceFileNavigationIntent(
  path: string,
  origin: ComputerOrigin,
): DesktopNavigationIntent {
  return {
    id: crypto.randomUUID(),
    kind: "workspace-file",
    target: { path, origin },
  };
}

export function createOrchestrationTaskNavigationIntent(
  taskId: string,
): DesktopNavigationIntent {
  return {
    id: crypto.randomUUID(),
    kind: "orchestration-task",
    target: { taskId },
  };
}

export function createProjectSourceNavigationIntent(
  projectId: string,
  resourceId: string,
): DesktopNavigationIntent {
  return {
    id: crypto.randomUUID(),
    kind: "project-source",
    target: { projectId, resourceId },
  };
}

export function createRuntimeLogNavigationIntent(
  logId: string,
  query: string,
): DesktopNavigationIntent {
  return {
    id: crypto.randomUUID(),
    kind: "runtime-log",
    target: { logId, query },
  };
}

export function acknowledgeNavigationIntent<T extends DesktopNavigationIntent>(
  current: T | null,
  id: string,
): T | null {
  return current?.id === id ? null : current;
}
