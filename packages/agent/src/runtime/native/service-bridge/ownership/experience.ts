import { DOOLITTLE_EXPERIENCE_SERVICE } from "@doolittle/contracts";
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
): NativeExperienceSummary {
  const service = getNativeServices(runtime).experience;
  if (!service) {
    throw new Error(
      `Required Eliza service ${DOOLITTLE_EXPERIENCE_SERVICE} is unavailable.`,
    );
  }
  return service.summary() as NativeExperienceSummary;
}
