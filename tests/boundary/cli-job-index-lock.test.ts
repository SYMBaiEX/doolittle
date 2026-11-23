import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { expect, it } from "vitest";
import { createCliJob, listCliJobs } from "../../apps/cli/src/cli/jobs/store";
import { jobsRoot } from "../../apps/cli/src/cli/jobs/store/index-store";

it("keeps a live job index lock and recovers immediately after its owner is killed", async () => {
  const cliDir = fileURLToPath(new URL("../../apps/cli", import.meta.url));
  const { outputFiles } = buildSync({
    stdin: {
      resolveDir: cliDir,
      contents: `
        import { updateJobsIndex } from "./src/cli/jobs/store/index-store.ts";
        updateJobsIndex(process.argv[1], () => {
          process.stdout.write("locked");
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
        });
      `,
    },
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["@elizaos/core"],
    write: false,
  });
  const dataDir = mkdtempSync(join(tmpdir(), "cli-job-lock-"));
  try {
    const job = createCliJob(dataDir, "existing job");
    const child = spawn(
      process.execPath,
      ["--input-type=module", "-e", outputFiles[0].text, dataDir],
      { cwd: cliDir, stdio: ["ignore", "pipe", "inherit"] },
    );
    const exited = once(child, "exit");
    try {
      const result = await Promise.race([
        once(child.stdout, "data"),
        exited.then(() => {
          throw new Error("Worker exited before locking the job index.");
        }),
      ]);
      expect(String(result[0]).trim()).toBe("locked");
      expect(() => listCliJobs(dataDir)).toThrow("Job index is locked.");
    } finally {
      child.kill("SIGKILL");
      await exited;
    }
    expect(listCliJobs(dataDir)).toEqual([job]);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}, 15_000);

it("recovers from an old, empty legacy index lock directory", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "cli-legacy-job-lock-"));
  try {
    const lock = join(jobsRoot(dataDir), ".index-lock");
    mkdirSync(lock, { recursive: true, mode: 0o700 });
    const old = new Date(Date.now() - 60_000);
    utimesSync(lock, old, old);
    expect(listCliJobs(dataDir)).toEqual([]);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
