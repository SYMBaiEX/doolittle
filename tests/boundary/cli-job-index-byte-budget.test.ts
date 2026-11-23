import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  appendCliJobEvent,
  createCliJob,
  finalizeCliJob,
  listCliJobs,
  readCliJobEvents,
} from "../../apps/cli/src/cli/jobs/store";
import { jobsRoot } from "../../apps/cli/src/cli/jobs/store/index-store";

const mebibyte = 1024 * 1024;

it("retains finished jobs and their replay without blocking new jobs at the index byte limit", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "cli-job-index-budget-"));
  try {
    const prompt = "a".repeat(mebibyte);
    const oldest = createCliJob(dataDir, prompt).id;
    const finished = [oldest];
    const event = {
      type: "notice",
      kind: "status",
      message: "retained replay",
      timestamp: new Date().toISOString(),
    } as const;
    appendCliJobEvent(dataDir, oldest, event);
    finalizeCliJob(dataDir, oldest, "completed", 0);
    for (let i = 1; i < 16; i++) {
      const { id } = createCliJob(dataDir, prompt);
      finalizeCliJob(dataDir, id, "completed", 0);
      finished.push(id);
    }

    const newest = createCliJob(dataDir, prompt);
    const jobs = listCliJobs(dataDir);
    expect(jobs.map(({ id }) => id)).toEqual([
      newest.id,
      ...finished.reverse(),
    ]);
    expect(jobs[0].prompt.length).toBe(prompt.length);
    expect(jobs.at(-1)?.prompt.length).toBeLessThan(prompt.length);
    expect(readCliJobEvents(dataDir, oldest)).toEqual([event]);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}, 20_000);

it("leaves active prompts and job directories unchanged when a new job cannot fit", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "cli-job-index-budget-active-"));
  try {
    const prompt = "\0".repeat(mebibyte);
    const first = createCliJob(dataDir, prompt);
    const second = createCliJob(dataDir, prompt);
    const files = readdirSync(jobsRoot(dataDir));

    expect(() => createCliJob(dataDir, prompt)).toThrow(
      "Job index exceeds maximum bytes.",
    );
    expect(readdirSync(jobsRoot(dataDir))).toEqual(files);
    expect(listCliJobs(dataDir).map(({ id }) => id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(listCliJobs(dataDir).every((job) => job.prompt === prompt)).toBe(
      true,
    );
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
