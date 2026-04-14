import { randomUUID } from "node:crypto";
import type { CronJobRecord } from "@/types";
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
  const firstRun = computeNextRunAt(input.schedule, now, timezone);
  return {
    id: randomUUID(),
    name: input.name,
    prompt: input.prompt,
    schedule: input.schedule,
    delivery: input.delivery ?? "local",
    skills: input.skills ?? [],
    runtime: normalizeRuntimeOverrides(input.runtime),
    status: "active",
    oneShot: !isEverySchedule(input.schedule),
    nextRunAt: firstRun.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}
