export function countQueuePending(queue: unknown): number {
  if (queue && typeof queue === "object") {
    const pending = (queue as { pending?: unknown }).pending;
    if (typeof pending === "number") {
      return pending;
    }
    const items = (queue as { items?: unknown }).items;
    if (Array.isArray(items)) {
      return items.filter((entry) => {
        if (!entry || typeof entry !== "object") {
          return false;
        }
        const status = String(
          (entry as { status?: unknown }).status ?? "",
        ).toLowerCase();
        return status === "pending" || status === "queued";
      }).length;
    }
  }
  return 0;
}

export function countQueueActiveWorkers(queue: unknown): number {
  if (queue && typeof queue === "object") {
    const activeWorkers = (queue as { activeWorkers?: unknown }).activeWorkers;
    if (typeof activeWorkers === "number") {
      return activeWorkers;
    }
    const items = (queue as { items?: unknown }).items;
    if (Array.isArray(items)) {
      return items.filter((entry) => {
        if (!entry || typeof entry !== "object") {
          return false;
        }
        const status = String(
          (entry as { status?: unknown }).status ?? "",
        ).toLowerCase();
        return status === "running" || status === "active";
      }).length;
    }
  }
  return 0;
}
