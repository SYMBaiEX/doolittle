export type TaskNavigationResolution =
  | { kind: "wait" }
  | { kind: "missing" }
  | { kind: "select"; taskId: string };

export function resolveTaskNavigationIntent(input: {
  taskId: string;
  loading: boolean;
  error?: unknown;
  tasks: ReadonlyArray<{ id: string }>;
}): TaskNavigationResolution {
  const taskId = input.taskId.trim();
  if (!taskId || input.loading || input.error) {
    return { kind: "wait" };
  }

  return input.tasks.some((task) => task.id === taskId)
    ? { kind: "select", taskId }
    : { kind: "missing" };
}
