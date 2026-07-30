export type DesktopNavigationIntent =
  | {
      id: string;
      kind: "workspace-file";
      target: { path: string };
    }
  | {
      id: string;
      kind: "orchestration-task";
      target: { taskId: string };
    };

export function createWorkspaceFileNavigationIntent(
  path: string,
): DesktopNavigationIntent {
  return {
    id: crypto.randomUUID(),
    kind: "workspace-file",
    target: { path },
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

export function acknowledgeNavigationIntent<T extends DesktopNavigationIntent>(
  current: T | null,
  id: string,
): T | null {
  return current?.id === id ? null : current;
}
