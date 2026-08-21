import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runProviderCommand } from "./command";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("runProviderCommand", () => {
  it("passes arguments, cwd, and safe environment while separating output", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "doolittle-provider-command-"));
    roots.push(cwd);

    const result = await runProviderCommand({
      command: process.execPath,
      args: [
        "--eval",
        [
          "console.log(JSON.stringify({ cwd: process.cwd(), value: process.env.DOOLITTLE_TEST_VALUE }))",
          'console.error("provider diagnostic")',
        ].join(";"),
      ],
      cwd,
      env: {
        DOOLITTLE_TEST_VALUE: "safe value",
        NODE_OPTIONS: "--this-must-not-reach-the-child",
      },
      timeoutMs: 5_000,
    });

    expect(result).toMatchObject({ exitCode: 0, termination: "exit" });
    expect(JSON.parse(result.stdout)).toEqual({
      cwd: realpathSync(cwd),
      value: "safe value",
    });
    expect(result.stderr.trim()).toBe("provider diagnostic");
  });

  it("returns nonzero exits with their stdout and stderr intact", async () => {
    const result = await runProviderCommand({
      command: process.execPath,
      args: [
        "--eval",
        'console.log("partial output"); console.error("failed"); process.exit(7)',
      ],
    });

    expect(result).toMatchObject({ exitCode: 7, termination: "exit" });
    expect(result.stdout.trim()).toBe("partial output");
    expect(result.stderr.trim()).toBe("failed");
  });

  it("terminates a process group at the configured deadline", async () => {
    const result = await runProviderCommand({
      command: process.execPath,
      args: ["--eval", "setInterval(() => {}, 1_000)"],
      timeoutMs: 40,
    });

    expect(result).toMatchObject({ exitCode: 124, termination: "timeout" });
    expect(result.durationMs).toBeLessThan(2_000);
    expect(result.stderr).toContain(
      "[provider-transport] command timed out after 40ms",
    );
  });

  it("terminates and rejects with AbortError when the caller cancels", async () => {
    const controller = new AbortController();
    const pending = runProviderCommand({
      command: process.execPath,
      args: ["--eval", "setInterval(() => {}, 1_000)"],
      timeoutMs: 5_000,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 40);

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
