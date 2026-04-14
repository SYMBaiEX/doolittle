import type { AppServices } from "@/services";
import type { MemorySummary } from "@/services/memory-service";
import { getNativeServices, type RuntimeLike } from "../runtime";
import type { NativeExperienceSummary } from "./types";

export function getEffectiveMemorySnapshot(
  runtime: RuntimeLike,
  services: AppServices,
  target: "memory" | "user" = "memory",
): MemorySummary {
  return (getNativeServices(runtime).knowledge?.summary?.(target) ??
    services.memory.summary(target)) as MemorySummary;
}

export function getEffectiveExperienceSummary(
  runtime: RuntimeLike,
  services: AppServices,
): NativeExperienceSummary {
  return (getNativeServices(runtime).experience?.summary?.() ?? {
    sessions: {
      ...services.sessions.summary(),
    },
    memory: {
      shared: getEffectiveMemorySnapshot(runtime, services, "memory"),
      user: getEffectiveMemorySnapshot(runtime, services, "user"),
    },
  }) as NativeExperienceSummary;
}
