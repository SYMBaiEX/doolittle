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
      job.nextRunAt = computeNextRunAt(
        job.schedule,
        now,
        this.timezone,
      ).toISOString();
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
    return this.storage.readJobs().find((job) => job.id === id);
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
    const jobs = this.storage.readJobs();
    const job = withMutatedCronJob(jobs, id, mutate);
    this.storage.writeJobs(jobs);
    return job;
  }
}
