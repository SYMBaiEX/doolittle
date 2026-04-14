import type { CronJobRecord } from "@/types";
import {
  computeNextRunAt,
  isEverySchedule,
  normalizeRuntimeOverrides,
} from "../job-rules";
import type { UpdateCronJobInput } from "./types";

export function applyCronJobUpdate(
  job: CronJobRecord,
  input: UpdateCronJobInput,
  timezone: string,
  now: Date,
): void {
  if (input.name !== undefined) {
    job.name = input.name;
  }
  if (input.prompt !== undefined) {
    job.prompt = input.prompt;
  }
  if (input.schedule !== undefined) {
    job.schedule = input.schedule;
    job.oneShot = !isEverySchedule(input.schedule);
    if (job.status === "active") {
      job.nextRunAt = computeNextRunAt(
        job.schedule,
        now,
        timezone,
      ).toISOString();
    }
  }
  if (input.skills !== undefined) {
    job.skills = input.skills;
  }
  if (input.delivery !== undefined) {
    job.delivery = input.delivery;
  }
  if (input.clearRuntime) {
    job.runtime = undefined;
  } else if (input.runtime !== undefined) {
    job.runtime = normalizeRuntimeOverrides(input.runtime);
  }
  job.updatedAt = now.toISOString();
}

export function withMutatedCronJob(
  jobs: CronJobRecord[],
  id: string,
  mutate: (job: CronJobRecord) => void,
): CronJobRecord {
  const job = jobs.find((candidate) => candidate.id === id);
  if (!job) {
    throw new Error(`Cron job not found: ${id}`);
  }
  mutate(job);
  return job;
}
