import { computeNextRunAt, isEverySchedule } from "../job-rules";
import type { CronStorage } from "../storage";
import type { CronExecutor, CronTickResult } from "./types";

export async function runDueCronJobs(
  storage: CronStorage,
  executor: CronExecutor,
  timezone: string,
): Promise<CronTickResult> {
  const jobs = storage.readJobs();
  const now = new Date();
  let dirty = false;

  for (const job of jobs) {
    if (job.status !== "active" || !job.nextRunAt) {
      continue;
    }

    const nextRun = new Date(job.nextRunAt);
    if (Number.isNaN(nextRun.getTime()) || nextRun > now) {
      continue;
    }

    const output = await executor(job);
    job.lastRunAt = now.toISOString();
    job.updatedAt = now.toISOString();
    storage.appendRun(job, output);
    dirty = true;

    if (job.oneShot && !isEverySchedule(job.schedule)) {
      job.status = "paused";
      job.nextRunAt = undefined;
      continue;
    }

    job.nextRunAt = computeNextRunAt(job.schedule, now, timezone).toISOString();
  }

  return { jobs, dirty };
}
