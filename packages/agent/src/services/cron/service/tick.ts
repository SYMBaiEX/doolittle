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

    // Isolate each job: a throwing executor must not abort the whole tick or
    // leave the job un-advanced (which would hot-loop it every tick). Record
    // the failure and let the job back off to its normal cadence below.
    let output: string;
    try {
      output = await executor(job);
    } catch (error) {
      output = `Cron job failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
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
