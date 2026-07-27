import { randomUUID } from "node:crypto";
import type { CronJobRecord } from "@/types";
import { buildAutomationDefinition } from "../definition";
import {
  computeNextRunAt,
  isEverySchedule,
  normalizeRuntimeOverrides,
} from "../job-rules";
import type { CreateCronJobInput } from "./types";

export function buildCronJobRecord(
  input: CreateCronJobInput,
  now: Date,
  timezone: string,
): CronJobRecord {
  const definition = buildAutomationDefinition(input);
  const firstRun =
    definition.trigger.type === "schedule"
      ? computeNextRunAt(definition.trigger.schedule, now, timezone)
      : undefined;
  return {
    id: randomUUID(),
    name: input.name.trim(),
    prompt: definition.prompt,
    schedule: definition.schedule,
    delivery: input.delivery ?? "local",
    skills: input.skills ?? [],
    runtime: normalizeRuntimeOverrides(input.runtime),
    status: "active",
    oneShot:
      definition.trigger.type === "schedule" &&
      !isEverySchedule(definition.trigger.schedule),
    nextRunAt: firstRun?.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    trigger: definition.trigger,
    condition: definition.condition,
    action: definition.action,
  };
}
