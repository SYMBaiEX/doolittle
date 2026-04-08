import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AutomationRunRecord, CronJobRecord } from "@/types";

function safeCronOutputName(name: string): string {
  return name.replace(/[^a-z0-9-_]+/giu, "-").toLowerCase();
}

export class CronStorage {
  private readonly jobsPath: string;
  private readonly runsPath: string;

  constructor(
    baseDir: string,
    private readonly outputDir: string,
  ) {
    mkdirSync(baseDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
    this.jobsPath = join(baseDir, "cron-jobs.json");
    this.runsPath = join(baseDir, "cron-runs.json");
    if (!existsSync(this.jobsPath)) {
      this.writeJobs([]);
    }
    if (!existsSync(this.runsPath)) {
      this.writeRuns([]);
    }
  }

  readJobs(): CronJobRecord[] {
    try {
      const raw = readFileSync(this.jobsPath, "utf8");
      return JSON.parse(raw) as CronJobRecord[];
    } catch {
      return [];
    }
  }

  writeJobs(jobs: CronJobRecord[]): void {
    writeFileSync(this.jobsPath, JSON.stringify(jobs, null, 2), "utf8");
  }

  readRuns(): AutomationRunRecord[] {
    try {
      const raw = readFileSync(this.runsPath, "utf8");
      return JSON.parse(raw) as AutomationRunRecord[];
    } catch {
      return [];
    }
  }

  writeRuns(runs: AutomationRunRecord[]): void {
    writeFileSync(this.runsPath, JSON.stringify(runs, null, 2), "utf8");
  }

  appendRun(job: CronJobRecord, output: string): AutomationRunRecord {
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
      const filePath = join(
        this.outputDir,
        `${safeCronOutputName(job.name)}-${Date.now()}.md`,
      );
      writeFileSync(filePath, output, "utf8");
      record.outputPath = filePath;
    }

    runs.push(record);
    this.writeRuns(runs.length > 200 ? runs.slice(-200) : runs);
    return record;
  }
}
