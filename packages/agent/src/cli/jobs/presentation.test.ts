import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cliJobStatusSummary,
  jobHasLiveLog,
  renderCliJobReplay,
} from "./presentation";
import { appendCliJobEvent, createCliJob, listCliJobs } from "./store";

describe("cli job presentation", () => {
  it("renders empty summaries and empty replays safely", () => {
    const dataDir = mkdtempSync(
      join(tmpdir(), "doolittle-cli-jobs-presentation-"),
    );

    expect(cliJobStatusSummary(dataDir)).toBe("No background jobs recorded.");

    const job = createCliJob(dataDir, "hello world");
    expect(renderCliJobReplay(dataDir, job.id)).toBe(
      "No job events recorded yet.",
    );
    expect(jobHasLiveLog(dataDir, job.id)).toBe(false);
    expect(listCliJobs(dataDir)).toHaveLength(1);
  });

  it("renders replay text and detects live logs once events exist", () => {
    const dataDir = mkdtempSync(
      join(tmpdir(), "doolittle-cli-jobs-presentation-"),
    );
    const job = createCliJob(dataDir, "hello world");

    appendCliJobEvent(dataDir, job.id, {
      type: "notice",
      timestamp: new Date().toISOString(),
      kind: "status",
      message: "booted",
    });

    expect(renderCliJobReplay(dataDir, job.id)).toContain("booted");
    expect(jobHasLiveLog(dataDir, job.id)).toBe(true);
    expect(cliJobStatusSummary(dataDir)).toContain("hello world");
  });
});
