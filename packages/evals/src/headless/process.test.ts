import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { execPath, platform } from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import { executeHeadlessChild } from "./process";

const temporaryDirectories: string[] = [];

function tempDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), "doolittle-headless-process-test-"));
  temporaryDirectories.push(path);
  return path;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const path = temporaryDirectories.pop();
    if (path) rmSync(path, { recursive: true, force: true });
  }
});

describe("bounded headless child execution", () => {
  it.skipIf(platform === "win32")(
    "returns at the timeout and kills descendants holding inherited pipes",
    async () => {
      const directory = tempDirectory();
      const markerPath = join(directory, "descendant-survived.txt");
      const descendant = `setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(markerPath)}, "survived"), 400);`;
      const parent = [
        'const { spawn } = require("node:child_process");',
        `spawn(process.execPath, ["-e", ${JSON.stringify(descendant)}], { stdio: "inherit" });`,
        "setInterval(() => {}, 1000);",
      ].join("\n");
      const startedAt = performance.now();
      const result = await executeHeadlessChild(execPath, ["-e", parent], {
        cwd: directory,
        env: process.env,
        timeoutMs: 80,
        killGraceMs: 50,
      });

      expect((result.error as NodeJS.ErrnoException | undefined)?.code).toBe(
        "ETIMEDOUT",
      );
      expect(performance.now() - startedAt).toBeLessThan(1_000);
      await new Promise((resolve) => setTimeout(resolve, 450));
      expect(existsSync(markerPath)).toBe(false);
    },
  );

  it("terminates a child that exceeds the captured output budget", async () => {
    const directory = tempDirectory();
    const result = await executeHeadlessChild(
      execPath,
      [
        "-e",
        'process.stdout.write("x".repeat(1024 * 1024)); setInterval(() => {}, 1000);',
      ],
      {
        cwd: directory,
        env: process.env,
        timeoutMs: 1_000,
        killGraceMs: 50,
        maxBufferBytes: 1024,
      },
    );

    expect((result.error as NodeJS.ErrnoException | undefined)?.code).toBe(
      "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
    );
    expect(result.stdout.length).toBe(0);
  });
});
