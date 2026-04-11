import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendCliJobEvent,
  createCliJob,
  finalizeCliJob,
  getCliJob,
  listCliJobs,
  readCliJobEvents,
  summarizeCliJob,
} from "./store";

describe("cli job store", () => {
  it("creates, persists, finalizes, and replays job events", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-cli-jobs-"));
    const job = createCliJob(dataDir, "hello world");

    expect(listCliJobs(dataDir)).toHaveLength(1);
    appendCliJobEvent(dataDir, job.id, {
      type: "notice",
      timestamp: new Date().toISOString(),
      kind: "status",
      message: "booted",
    });
    finalizeCliJob(dataDir, job.id, "completed", 0);

    const stored = getCliJob(dataDir, job.id);
    expect(readCliJobEvents(dataDir, job.id)).toHaveLength(1);
    expect(stored?.status).toBe("completed");
    expect(stored).toBeDefined();
    expect(summarizeCliJob(stored as NonNullable<typeof stored>)).toContain(
      "prompt=hello world",
    );
  });
});
