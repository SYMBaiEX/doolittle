import type { AppServices } from "@/services";
import type { MemorySummary } from "@/services/experience-memory-service";
import { getNativeServices, type RuntimeLike } from "../runtime";
import type { NativeExperienceSummary } from "./types";

export function getEffectiveMemorySnapshot(
  _runtime: RuntimeLike,
  services: Pick<AppServices, "memory">,
  target: "memory" | "user" = "memory",
  userId?: string,
): MemorySummary {
  return services.memory.summary(target, userId);
}

export function getEffectiveExperienceSummary(
  runtime: RuntimeLike,
  services: Pick<AppServices, "memory" | "sessions">,
): NativeExperienceSummary {
  return (getNativeServices(runtime).experience?.summary?.() ?? {
    sessions: {
      ...services.sessions.summary(),
    },
    memory: {
      shared: getEffectiveMemorySnapshot(runtime, services, "memory"),
    },
  }) as NativeExperienceSummary;
}
