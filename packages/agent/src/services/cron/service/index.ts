import { hydrateAutomationJob } from "../definition";
import { executeAutomationJob } from "../execution";
import { computeNextRunAt } from "../job-rules";
import { CronStorage } from "../storage";
import { buildCronJobRecord } from "./create";
import { applyCronJobUpdate, withMutatedCronJob } from "./mutations";
import { runDueCronJobs } from "./tick";
import type {
  AutomationRunRecord,
  CreateCronJobInput,
  CronExecutor,
  CronJobRecord,
  UpdateCronJobInput,
} from "./types";

export class CronService {
  private readonly storage: CronStorage;
  private intervalHandle?: ReturnType<typeof setInterval>;
  private executor?: CronExecutor;

  constructor(
    baseDir: string,
    outputDir: string,
    private readonly tickSeconds: number,
    private readonly timezone = "UTC",
  ) {
    this.storage = new CronStorage(baseDir, outputDir);
  }

  setExecutor(executor: CronExecutor): void {
    this.executor = executor;
  }

  start(): void {
    if (this.intervalHandle) {
      return;
    }

    this.intervalHandle = setInterval(() => {
      void this.tick();
    }, this.tickSeconds * 1000);
    this.intervalHandle.unref?.();
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
  }

  list(): CronJobRecord[] {
    return this.storage
      .readJobs()
      .map(hydrateAutomationJob)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  recentRuns(limit = 25): AutomationRunRecord[] {
    return this.storage.readRuns().slice(-limit).reverse();
  }

  runs(limit = 25): AutomationRunRecord[] {
    return this.recentRuns(limit);
  }

  create(input: CreateCronJobInput): CronJobRecord {
    const jobs = this.storage.readJobs();
    const now = new Date();
    const record = buildCronJobRecord(input, now, this.timezone);

    jobs.push(record);
    this.storage.writeJobs(jobs);
    return record;
  }

  pause(id: string): CronJobRecord {
    return this.mutate(id, (job) => {
      job.status = "paused";
      job.updatedAt = new Date().toISOString();
    });
  }

  resume(id: string): CronJobRecord {
    return this.mutate(id, (job) => {
      const now = new Date();
      job.status = "active";
      const trigger = hydrateAutomationJob(job).trigger;
      job.nextRunAt =
        trigger?.type === "schedule"
          ? computeNextRunAt(trigger.schedule, now, this.timezone).toISOString()
          : undefined;
      job.updatedAt = now.toISOString();
    });
  }

  runNow(id: string): CronJobRecord {
    return this.mutate(id, (job) => {
      job.nextRunAt = new Date().toISOString();
      job.updatedAt = new Date().toISOString();
    });
  }

  remove(id: string): void {
    const nextJobs = this.storage.readJobs().filter((job) => job.id !== id);
    this.storage.writeJobs(nextJobs);
  }

  get(id: string): CronJobRecord | undefined {
    const job = this.storage.readJobs().find((job) => job.id === id);
    return job ? hydrateAutomationJob(job) : undefined;
  }

  async triggerNow(
    id: string,
    source: "manual" | "webhook" = "manual",
    payload?: Record<string, unknown>,
  ): Promise<AutomationRunRecord> {
    if (!this.executor) {
      throw new Error("Automation execution is not ready.");
    }
    const jobs = this.storage.readJobs().map(hydrateAutomationJob);
    const job = jobs.find((candidate) => candidate.id === id);
    if (!job) {
      throw new Error(`Cron job not found: ${id}`);
    }
    if (job.status !== "active") {
      throw new Error(`Automation "${job.name}" is paused.`);
    }

    const run = await executeAutomationJob({
      storage: this.storage,
      executor: this.executor,
      job,
      context: { source, payload },
    });
    const now = new Date().toISOString();
    job.lastRunAt = now;
    job.updatedAt = now;
    this.storage.writeJobs(jobs);
    return run;
  }

  async triggerWebhook(
    token: string,
    payload?: Record<string, unknown>,
  ): Promise<AutomationRunRecord> {
    const job = this.list().find(
      (candidate) =>
        candidate.trigger?.type === "webhook" &&
        candidate.trigger.token === token,
    );
    if (!job) {
      throw new Error("Webhook automation not found.");
    }
    return this.triggerNow(job.id, "webhook", payload);
  }

  updateConfig(id: string, input: UpdateCronJobInput): CronJobRecord {
    return this.mutate(id, (job) => {
      applyCronJobUpdate(job, input, this.timezone, new Date());
    });
  }

  update(id: string, input: UpdateCronJobInput): CronJobRecord {
    return this.updateConfig(id, input);
  }

  async tick(): Promise<void> {
    if (!this.executor) {
      return;
    }

    const { jobs, dirty } = await runDueCronJobs(
      this.storage,
      this.executor,
      this.timezone,
    );

    if (dirty) {
      this.storage.writeJobs(jobs);
    }
  }

  private mutate(
    id: string,
    mutate: (job: CronJobRecord) => void,
  ): CronJobRecord {
    const jobs = this.storage.readJobs().map(hydrateAutomationJob);
    const job = withMutatedCronJob(jobs, id, mutate);
    this.storage.writeJobs(jobs);
    return job;
  }
}
