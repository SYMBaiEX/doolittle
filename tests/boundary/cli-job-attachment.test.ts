import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { attachCliJob } from "../../apps/cli/src/cli/jobs/lifecycle";
import {
  appendCliJobEvent,
  createCliJob,
  finalizeCliJob,
} from "../../apps/cli/src/cli/jobs/store";
import type { CliTurnEvent } from "../../apps/cli/src/cli/turn-events";

it("replays identical events already in the log and appended during attachment", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "cli-job-attachment-"));
  try {
    const { id } = createCliJob(dataDir, "test job");
    const event = {
      type: "notice",
      kind: "status",
      message: "repeated notice",
      timestamp: new Date().toISOString(),
    } satisfies CliTurnEvent;
    appendCliJobEvent(dataDir, id, event);
    appendCliJobEvent(dataDir, id, event);
    const seen: CliTurnEvent[] = [];
    const job = await attachCliJob(dataDir, id, {
      onEvent(entry) {
        seen.push(entry);
        if (seen.length === 1) {
          appendCliJobEvent(dataDir, id, event);
          finalizeCliJob(dataDir, id, "completed");
        }
      },
    });
    expect(job?.status).toBe("completed");
    expect(seen).toEqual([event, event, event]);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
