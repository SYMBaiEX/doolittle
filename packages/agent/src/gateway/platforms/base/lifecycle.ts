import type { LifecycleHistory, PlatformLifecycleEvent } from "./types";

export function nowIso(): string {
  return new Date().toISOString();
}

export function createLifecycleHistory(limit = 12): LifecycleHistory {
  const events: PlatformLifecycleEvent[] = [];

  return {
    record(kind, detail) {
      const event = {
        at: nowIso(),
        kind,
        detail,
      };
      events.push(event);
      if (events.length > limit) {
        events.splice(0, events.length - limit);
      }
      return event;
    },
    recent(recentLimit = limit) {
      return events.slice(-recentLimit).reverse();
    },
    total() {
      return events.length;
    },
  };
}
