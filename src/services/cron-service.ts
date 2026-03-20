import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AutomationRunRecord, CronJobRecord } from "@/types";

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

  create(input: {
    name: string;
    prompt: string;
    schedule: string;
    skills?: string[];
    delivery?: "origin" | "local";
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
      status: "active",
      oneShot: !input.schedule.trim().startsWith("every "),
      nextRunAt: firstRun?.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    jobs.push(record);
    this.writeJobs(jobs);
    return record;
  }

  pause(id: string): CronJobRecord {
    return this.update(id, (job) => {
      job.status = "paused";
      job.updatedAt = new Date().toISOString();
    });
  }

  resume(id: string): CronJobRecord {
    return this.update(id, (job) => {
      job.status = "active";
      job.nextRunAt = this.computeNextRun(job.schedule, new Date())?.toISOString();
      job.updatedAt = new Date().toISOString();
    });
  }

  runNow(id: string): CronJobRecord {
    return this.update(id, (job) => {
      job.nextRunAt = new Date().toISOString();
      job.updatedAt = new Date().toISOString();
    });
  }

  remove(id: string): void {
    const nextJobs = this.readJobs().filter((job) => job.id !== id);
    this.writeJobs(nextJobs);
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
        job.nextRunAt = this.computeNextRun(job.schedule, now)?.toISOString();
      }
    }

    if (dirty) {
      this.writeJobs(jobs);
    }
  }

  private update(id: string, mutate: (job: CronJobRecord) => void): CronJobRecord {
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

  private computeNextRun(schedule: string, from: Date): Date | undefined {
    const trimmed = schedule.trim().toLowerCase();
    const duration = this.parseDuration(trimmed.replace(/^every\s+/u, ""));

    if (trimmed.startsWith("every ") && duration) {
      return new Date(from.getTime() + duration);
    }

    if (duration) {
      return new Date(from.getTime() + duration);
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
    const [minuteExpr, hourExpr, dayExpr, monthExpr, weekdayExpr] = expression.split(/\s+/u);
    const probe = new Date(from.getTime());
    probe.setSeconds(0, 0);
    probe.setMinutes(probe.getMinutes() + 1);

    for (let step = 0; step < 525600; step += 1) {
      if (
        this.matchesField(probe.getMinutes(), minuteExpr, 0, 59) &&
        this.matchesField(probe.getHours(), hourExpr, 0, 23) &&
        this.matchesField(probe.getDate(), dayExpr, 1, 31) &&
        this.matchesField(probe.getMonth() + 1, monthExpr, 1, 12) &&
        this.matchesField(probe.getDay(), weekdayExpr, 0, 6)
      ) {
        return new Date(probe.getTime());
      }
      probe.setMinutes(probe.getMinutes() + 1);
    }

    throw new Error(`Could not compute next run for cron expression "${expression}".`);
  }

  private matchesField(value: number, expression: string, min: number, max: number): boolean {
    if (expression === "*") {
      return true;
    }

    return expression.split(",").some((segment) => {
      if (segment.includes("/")) {
        const [base, stepRaw] = segment.split("/");
        const step = Number(stepRaw);
        const start = base === "*" ? min : Number(base);
        return value >= start && value <= max && (value - start) % step === 0;
      }

      if (segment.includes("-")) {
        const [rangeStart, rangeEnd] = segment.split("-").map(Number);
        return value >= rangeStart && value <= rangeEnd;
      }

      return value === Number(segment);
    });
  }
}
