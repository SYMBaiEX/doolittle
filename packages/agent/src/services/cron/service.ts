import { randomUUID } from "node:crypto";
import type {
  AutomationRunRecord,
  CronJobRecord,
  CronJobRuntimeOverrides,
} from "@/types";
import {
  computeNextRunAt,
  isEverySchedule,
  normalizeRuntimeOverrides,
} from "./job-rules";
import { CronStorage } from "./storage";

type CronExecutor = (job: CronJobRecord) => Promise<string>;

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

  create(input: {
    name: string;
    prompt: string;
    schedule: string;
    skills?: string[];
    delivery?: "origin" | "local" | "home";
    runtime?: CronJobRuntimeOverrides;
  }): CronJobRecord {
    const jobs = this.storage.readJobs();
    const now = new Date();
    const firstRun = computeNextRunAt(input.schedule, now, this.timezone);
    const record: CronJobRecord = {
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
      job.status = "active";
      job.nextRunAt = computeNextRunAt(
        job.schedule,
        new Date(),
        this.timezone,
      ).toISOString();
      job.updatedAt = new Date().toISOString();
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

  updateConfig(
    id: string,
    input: {
      name?: string;
      prompt?: string;
      schedule?: string;
      skills?: string[];
      delivery?: "origin" | "local" | "home";
      runtime?: CronJobRuntimeOverrides;
      clearRuntime?: boolean;
    },
  ): CronJobRecord {
    return this.mutate(id, (job) => {
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
            new Date(),
            this.timezone,
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
      job.updatedAt = new Date().toISOString();
    });
  }

  update(
    id: string,
    input: Parameters<CronService["updateConfig"]>[1],
  ): CronJobRecord {
    return this.updateConfig(id, input);
  }

  async tick(): Promise<void> {
    if (!this.executor) {
      return;
    }

    const jobs = this.storage.readJobs();
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

      const output = await this.executor(job);
      job.lastRunAt = now.toISOString();
      job.updatedAt = now.toISOString();
      this.storage.appendRun(job, output);
      dirty = true;

      if (job.oneShot && !isEverySchedule(job.schedule)) {
        job.status = "paused";
        job.nextRunAt = undefined;
      } else {
        job.nextRunAt = computeNextRunAt(
          job.schedule,
          now,
          this.timezone,
        ).toISOString();
      }
    }

    if (dirty) {
      this.storage.writeJobs(jobs);
    }
  }

  private mutate(
    id: string,
    mutate: (job: CronJobRecord) => void,
  ): CronJobRecord {
    const jobs = this.storage.readJobs();
    const job = jobs.find((candidate) => candidate.id === id);
    if (!job) {
      throw new Error(`Cron job not found: ${id}`);
    }
    mutate(job);
    this.storage.writeJobs(jobs);
    return job;
  }
}
