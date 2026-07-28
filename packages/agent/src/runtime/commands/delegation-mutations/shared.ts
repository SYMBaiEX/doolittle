export function resolveDelegationPriority(
  priority: string | undefined,
): "low" | "normal" | "high" | undefined {
  if (priority === "low" || priority === "normal" || priority === "high") {
    return priority;
  }
  return undefined;
}
