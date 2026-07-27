import type { CronJobRecord } from "@/types";
import {
  normalizeAutomationAction,
  normalizeAutomationCondition,
  normalizeAutomationTrigger,
} from "../definition";
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
  const previousTrigger = job.trigger;
  if (input.name !== undefined) {
    job.name = input.name.trim();
  }
  if (input.prompt !== undefined) {
    job.prompt = input.prompt.trim();
    if (job.action?.type !== "webhook") {
      job.action = normalizeAutomationAction(
        job.action ? { ...job.action, prompt: input.prompt } : undefined,
        input.prompt,
      );
    }
  }
  if (input.trigger !== undefined || input.schedule !== undefined) {
    const trigger = normalizeAutomationTrigger(
      input.trigger,
      input.schedule,
      previousTrigger,
    );
    job.trigger = trigger;
    job.schedule =
      trigger.type === "schedule" ? trigger.schedule : trigger.type;
    job.oneShot =
      trigger.type === "schedule" && !isEverySchedule(trigger.schedule);
    if (job.status === "active" && trigger.type === "schedule") {
      job.nextRunAt = computeNextRunAt(
        trigger.schedule,
        now,
        timezone,
      ).toISOString();
    } else {
      job.nextRunAt = undefined;
    }
  }
  if (input.condition !== undefined) {
    job.condition = normalizeAutomationCondition(input.condition);
  }
  if (input.action !== undefined) {
    job.action = normalizeAutomationAction(input.action);
    job.prompt =
      job.action.type === "webhook"
        ? `POST ${job.action.url}`
        : job.action.prompt;
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
