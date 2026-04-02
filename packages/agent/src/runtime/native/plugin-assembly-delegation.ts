export type NativeDelegationPriority = "low" | "normal" | "high";

export function normalizeStringRecord(
  metadata?: Record<string, unknown>,
): Record<string, string> | undefined {
  if (!metadata) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, String(value)]),
  );
}

export function normalizeDelegationPriority(
  priority: unknown,
): NativeDelegationPriority {
  if (priority === "low" || priority === "high" || priority === "normal") {
    return priority;
  }

  return "normal";
}

export function normalizeDelegationInput<
  T extends { priority?: unknown; metadata?: Record<string, unknown> },
>(
  input: T,
): Omit<T, "priority" | "metadata"> & {
  priority: NativeDelegationPriority;
  metadata?: Record<string, string>;
} {
  return {
    ...input,
    priority: normalizeDelegationPriority(input.priority),
    metadata: normalizeStringRecord(input.metadata),
  };
}
