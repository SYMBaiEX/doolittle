export function countRecordLikeEntries(value: unknown): number {
  if (value instanceof Map) {
    return value.size;
  }
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length;
  }
  return 0;
}

export function countEntriesByStatus(
  entries: unknown[],
  status: string,
): number {
  return entries.filter((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }

    return (
      ((entry as { status?: unknown }).status ?? "")
        .toString()
        .toLowerCase() === status
    );
  }).length;
}

export function countEntriesWithKey(
  entries: unknown[],
  key: "taskId" | "workflowId",
): number {
  return entries.filter((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }

    return Boolean((entry as Record<string, unknown>)[key]);
  }).length;
}
