import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  createCliJob,
  finalizeCliJob,
  listCliJobs,
  markCliJobStarted,
} from "../../apps/cli/src/cli/jobs/store";
import { jobsRoot } from "../../apps/cli/src/cli/jobs/store/index-store";

it("rejects a full active job index and evicts only a terminal job when one is available", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "cli-job-retention-"));
  try {
    const oldest = createCliJob(dataDir, "running job");
    markCliJobStarted(dataDir, oldest.id, { pid: process.pid });
    for (let i = 0; i < 198; i++) createCliJob(dataDir, "queued job");
    const newest = createCliJob(dataDir, "newest job");
    const before = listCliJobs(dataDir).map(({ id }) => id);
    const files = readdirSync(jobsRoot(dataDir));
    expect(() => createCliJob(dataDir, "overflow")).toThrow(
      "Job index is full of active jobs.",
    );
    expect(listCliJobs(dataDir).map(({ id }) => id)).toEqual(before);
    expect(readdirSync(jobsRoot(dataDir))).toEqual(files);

    finalizeCliJob(dataDir, newest.id, "completed");
    const replacement = createCliJob(dataDir, "replacement");
    expect(listCliJobs(dataDir).map(({ id }) => id)).toEqual([
      replacement.id,
      ...before.filter((id) => id !== newest.id),
    ]);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
