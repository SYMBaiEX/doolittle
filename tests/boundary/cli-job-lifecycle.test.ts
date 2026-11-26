import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EnvConfig } from "@doolittle/agent/types";
import { afterEach, expect, it } from "vitest";
import { launchCliBackgroundJob } from "../../apps/cli/src/cli/jobs/lifecycle";
import {
  listCliJobs,
  readCliJobEvents,
} from "../../apps/cli/src/cli/jobs/store";
import { jobPaths } from "../../apps/cli/src/cli/jobs/store/index-store";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

it("marks an early-exiting child failed and retains bounded stderr diagnostics", async () => {
  const root = mkdtempSync(join(tmpdir(), "doolittle-cli-job-lifecycle-"));
  roots.push(root);
  const dataDir = join(root, "data");
  mkdirSync(dataDir, { mode: 0o700 });
  const launcherPath = join(root, "fail-child.js");
  writeFileSync(
    launcherPath,
    'process.stderr.write("deliberate child boot failure\\n"); process.exit(1);\n',
  );

  await expect(
    launchCliBackgroundJob({
      config: { dataDir } as EnvConfig,
      launcherPath,
      prompt: "deliberately fail",
    }),
  ).rejects.toThrow("deliberate child boot failure");

  const [job] = listCliJobs(dataDir);
  expect(job).toMatchObject({
    status: "failed",
    exitCode: 1,
    prompt: "deliberately fail",
  });
  expect(job.pid).toBeUndefined();
  expect(readFileSync(jobPaths(dataDir, job.id).stderrPath, "utf8")).toContain(
    "deliberate child boot failure",
  );
  const events = readCliJobEvents(dataDir, job.id);
  expect(events.at(-2)).toMatchObject({
    type: "error",
    message: expect.stringContaining("deliberate child boot failure"),
  });
  expect(events.at(-1)).toMatchObject({ type: "completed", status: "failed" });
});
