import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeNextCronRunAtMs,
  normalizeTriggerIntervalMs,
} from "@elizaos/autonomous/triggers/scheduling";
import type {
  AutomationRunRecord,
  CronJobRecord,
  CronJobRuntimeOverrides,
} from "@/types";

type CronExecutor = (job: CronJobRecord) => Promise<string>;

export class CronService {
  private readonly jobsPath: string;
  private readonly runsPath: string;
  private readonly outputDir: string;
  private intervalHandle?: ReturnType<typeof setInterval>;
  private executor?: CronExecutor;

  constructor(
    baseDir: string,
    outputDir: string,
    private readonly tickSeconds: number,
    private readonly timezone = "UTC",
  ) {
    mkdirSync(baseDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
    this.outputDir = outputDir;
    this.jobsPath = join(baseDir, "cron-jobs.json");
    this.runsPath = join(baseDir, "cron-runs.json");
    if (!existsSync(this.jobsPath)) {
      this.writeJobs([]);
    }
    if (!existsSync(this.runsPath)) {
      this.writeRuns([]);
    }
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
    return this.readJobs().sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
  }

  recentRuns(limit = 25): AutomationRunRecord[] {
    return this.readRuns().slice(-limit).reverse();
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
    const jobs = this.readJobs();
    const now = new Date();
    const firstRun = this.computeNextRun(input.schedule, now);
    const record: CronJobRecord = {
      id: randomUUID(),
      name: input.name,
      prompt: input.prompt,
      schedule: input.schedule,
      delivery: input.delivery ?? "local",
      skills: input.skills ?? [],
      runtime: this.normalizeRuntime(input.runtime),
      status: "active",
      oneShot: !input.schedule.trim().startsWith("every "),
      nextRunAt: firstRun.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    jobs.push(record);
    this.writeJobs(jobs);
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
      job.nextRunAt = this.computeNextRun(
        job.schedule,
        new Date(),
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
    const nextJobs = this.readJobs().filter((job) => job.id !== id);
    this.writeJobs(nextJobs);
  }

  get(id: string): CronJobRecord | undefined {
    return this.readJobs().find((job) => job.id === id);
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
        job.oneShot = !input.schedule.trim().startsWith("every ");
        if (job.status === "active") {
          job.nextRunAt = this.computeNextRun(
            job.schedule,
            new Date(),
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
        job.runtime = this.normalizeRuntime(input.runtime);
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

    const jobs = this.readJobs();
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
      this.recordRun(job, output);
      dirty = true;

      if (job.oneShot && !job.schedule.startsWith("every ")) {
        job.status = "paused";
        job.nextRunAt = undefined;
      } else {
        job.nextRunAt = this.computeNextRun(job.schedule, now).toISOString();
      }
    }

    if (dirty) {
      this.writeJobs(jobs);
    }
  }

  private mutate(
    id: string,
    mutate: (job: CronJobRecord) => void,
  ): CronJobRecord {
    const jobs = this.readJobs();
    const job = jobs.find((candidate) => candidate.id === id);
    if (!job) {
      throw new Error(`Cron job not found: ${id}`);
    }
    mutate(job);
    this.writeJobs(jobs);
    return job;
  }

  private readJobs(): CronJobRecord[] {
    try {
      const raw = readFileSync(this.jobsPath, "utf8");
      return JSON.parse(raw) as CronJobRecord[];
    } catch {
      return [];
    }
  }

  private writeJobs(jobs: CronJobRecord[]): void {
    writeFileSync(this.jobsPath, JSON.stringify(jobs, null, 2), "utf8");
  }

  private readRuns(): AutomationRunRecord[] {
    try {
      const raw = readFileSync(this.runsPath, "utf8");
      return JSON.parse(raw) as AutomationRunRecord[];
    } catch {
      return [];
    }
  }

  private writeRuns(runs: AutomationRunRecord[]): void {
    writeFileSync(this.runsPath, JSON.stringify(runs, null, 2), "utf8");
  }

  private recordRun(job: CronJobRecord, output: string): void {
    const runs = this.readRuns();
    const createdAt = new Date().toISOString();
    const record: AutomationRunRecord = {
      id: randomUUID(),
      jobId: job.id,
      jobName: job.name,
      output,
      createdAt,
    };

    if (job.delivery === "local") {
      const safeName = job.name.replace(/[^a-z0-9-_]+/giu, "-").toLowerCase();
      const filePath = join(this.outputDir, `${safeName}-${Date.now()}.md`);
      writeFileSync(filePath, output, "utf8");
      record.outputPath = filePath;
    }

    runs.push(record);
    if (runs.length > 200) {
      this.writeRuns(runs.slice(-200));
      return;
    }
    this.writeRuns(runs);
  }

  private normalizeRuntime(
    runtime?: CronJobRuntimeOverrides,
  ): CronJobRuntimeOverrides | undefined {
    if (!runtime) {
      return undefined;
    }

    const normalized: CronJobRuntimeOverrides = {};
    if (runtime.provider?.trim()) {
      normalized.provider = runtime.provider.trim();
    }
    if (runtime.model?.trim()) {
      normalized.model = runtime.model.trim();
    }
    if (runtime.baseUrl?.trim()) {
      normalized.baseUrl = runtime.baseUrl.trim();
    }
    if (
      typeof runtime.temperature === "number" &&
      !Number.isNaN(runtime.temperature)
    ) {
      normalized.temperature = runtime.temperature;
    }
    if (
      typeof runtime.maxTokens === "number" &&
      Number.isFinite(runtime.maxTokens)
    ) {
      normalized.maxTokens = Math.max(1, Math.trunc(runtime.maxTokens));
    }
    if (runtime.personalityId?.trim()) {
      normalized.personalityId = runtime.personalityId.trim();
    }

    return Object.keys(normalized).length ? normalized : undefined;
  }

  private computeNextRun(schedule: string, from: Date): Date {
    const trimmed = schedule.trim().toLowerCase();
    const duration = this.parseDuration(trimmed.replace(/^every\s+/u, ""));

    if (trimmed.startsWith("every ") && duration) {
      return new Date(from.getTime() + normalizeTriggerIntervalMs(duration));
    }

    if (duration) {
      return new Date(from.getTime() + normalizeTriggerIntervalMs(duration));
    }

    const cronMatch = schedule.trim().split(/\s+/u);
    if (cronMatch.length === 5) {
      return this.computeNextCronOccurrence(schedule.trim(), from);
    }

    throw new Error(
      `Unsupported schedule "${schedule}". Use "every 30m", "2h", or a 5-field cron expression.`,
    );
  }

  private parseDuration(value: string): number | undefined {
    const match = value.match(/^(\d+)(m|h|d)$/u);
    if (!match) {
      return undefined;
    }

    const amount = Number(match[1]);
    const unit = match[2];
    if (unit === "m") {
      return amount * 60 * 1000;
    }
    if (unit === "h") {
      return amount * 60 * 60 * 1000;
    }
    return amount * 24 * 60 * 60 * 1000;
  }

  private computeNextCronOccurrence(expression: string, from: Date): Date {
    const nextRunAtMs = computeNextCronRunAtMs(
      expression,
      from.getTime(),
      this.timezone,
    );
    if (nextRunAtMs !== null) {
      return new Date(nextRunAtMs);
    }
    throw new Error(
      `Could not compute next run for cron expression "${expression}".`,
    );
  }
}
