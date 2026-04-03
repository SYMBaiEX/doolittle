import type { DelegationOrchestrationMode } from "./contracts";

export function normalizeMetadata(
  metadata?: Record<string, unknown>,
): Record<string, string> | undefined {
  if (!metadata) {
    return undefined;
  }

  const normalized = Object.fromEntries(
    Object.entries(metadata)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [
        key,
        typeof value === "string" ? value : String(value),
      ]),
  );

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function normalizePriority(
  priority?: string,
): "low" | "normal" | "high" | undefined {
  return priority === "low" || priority === "high" || priority === "normal"
    ? priority
    : undefined;
}

export function normalizeOrchestrationMode(
  mode?: string,
): DelegationOrchestrationMode | undefined {
  return mode === "sequential" || mode === "parallel" || mode === "hierarchical"
    ? mode
    : undefined;
}

export function normalizeStringList(value?: unknown): string[] | undefined {
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const list = value
      .map((entry) =>
        typeof entry === "string" ? entry.trim() : String(entry).trim(),
      )
      .filter(Boolean);
    return list.length > 0 ? list : undefined;
  }

  if (typeof value === "string") {
    const list = value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    return list.length > 0 ? list : undefined;
  }

  return undefined;
}

export function normalizePositiveInteger(value?: unknown): number | undefined {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(numeric) && numeric > 0
    ? Math.floor(numeric)
    : undefined;
}
