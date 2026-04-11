import type { DelegationTaskRecord } from "@/types";

export interface DelegationUpdateEvent {
  kind: "created" | "updated";
  taskId: string;
  status: DelegationTaskRecord["status"];
  detail: string;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeDelegationLabels(labels?: string[]): string[] {
  return Array.from(
    new Set((labels ?? []).map((label) => label.trim()).filter(Boolean)),
  );
}

export function normalizeDelegationMetadata(
  metadata?: Record<string, string>,
): Record<string, string> | undefined {
  if (!metadata) {
    return undefined;
  }

  const normalized = Object.entries(metadata).reduce<Record<string, string>>(
    (accumulator, [key, value]) => {
      const normalizedKey = key.trim();
      const normalizedValue = value.trim();
      if (normalizedKey && normalizedValue) {
        accumulator[normalizedKey] = normalizedValue;
      }
      return accumulator;
    },
    {},
  );

  return Object.keys(normalized).length ? normalized : undefined;
}

export function mergeDelegationLists(
  ...lists: Array<string[] | undefined>
): string[] {
  return Array.from(
    new Set(
      lists
        .flatMap((list) => list ?? [])
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

export function isDelegationProcessAlive(pid?: number): boolean {
  if (!pid || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function buildDelegationUpdateEvent(
  kind: "created" | "updated",
  task: DelegationTaskRecord,
): DelegationUpdateEvent {
  return {
    kind,
    taskId: task.id,
    status: task.status,
    detail: `${task.title} (${task.status})`,
  };
}
