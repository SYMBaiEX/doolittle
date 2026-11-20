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

export function acknowledgeNavigationIntent<T extends DesktopNavigationIntent>(
  current: T | null,
  id: string,
): T | null {
  return current?.id === id ? null : current;
}
