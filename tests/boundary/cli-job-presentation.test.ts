import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { cliJobStatusSummary } from "../../apps/cli/src/cli/jobs/presentation";
import { createCliJob } from "../../apps/cli/src/cli/jobs/store";

it("bounds jobs list rows and truncates prompt previews explicitly", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "cli-job-presentation-"));
  try {
    createCliJob(
      dataDir,
      `inspect ${"workspace/".repeat(30)} README.md\nand then report`,
    );

    const lines = cliJobStatusSummary(dataDir).split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0].length).toBeLessThanOrEqual(160);
    expect(lines[0]).toContain("…");
    expect(lines[0]).not.toContain("\n");
    expect(lines[0]).toContain("prompt=");
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
