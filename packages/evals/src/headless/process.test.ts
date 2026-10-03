import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { execPath, platform } from "node:process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeHeadlessChild } from "./process";

const temporaryDirectories: string[] = [];

function tempDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), "doolittle-headless-process-test-"));
  temporaryDirectories.push(path);
  return path;
}

afterEach(() => {
  vi.restoreAllMocks();
  while (temporaryDirectories.length > 0) {
    const path = temporaryDirectories.pop();
    if (path) rmSync(path, { recursive: true, force: true });
  }
});

describe("bounded headless child execution", () => {
  it("observes accepted stdout chunks without affecting child success", async () => {
    const directory = tempDirectory();
    const chunks: Buffer[] = [];
    const result = await executeHeadlessChild(
      execPath,
      ["-e", 'process.stdout.write("first\\nsecond\\n")'],
      {
        cwd: directory,
        env: process.env,
        onStdoutChunk: (chunk) => {
          chunks.push(Buffer.from(chunk));
          throw new Error("telemetry observer failure");
        },
      },
    );

    expect(result.status).toBe(0);
    expect(result.cleanupSafe).toBe(platform !== "win32");
    expect(result.stdout).toBe("first\nsecond\n");
    expect(Buffer.concat(chunks).toString("utf8")).toBe(result.stdout);
  });

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

  it.skipIf(platform === "win32")(
    "retains escalation after the direct child closes while an independent-stdio descendant ignores TERM",
    async () => {
      const directory = tempDirectory();
      const markerPath = join(directory, "independent-descendant-survived.txt");
      const descendant = `process.on("SIGTERM", () => {}); process.send("ready"); setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(markerPath)}, "survived"), 700); setInterval(() => {}, 1000);`;
      const parent = `const child = require("node:child_process").spawn(process.execPath, ["-e", ${JSON.stringify(descendant)}], {stdio:["ignore","ignore","ignore","ipc"]}); child.on("message", () => { console.log(process.pid); child.disconnect(); }); setInterval(() => {}, 1000);`;
      let ownedPid: number | undefined;
      try {
        const result = await executeHeadlessChild(execPath, ["-e", parent], {
          cwd: directory,
          env: process.env,
          timeoutMs: 250,
          killGraceMs: 50,
          onStdoutChunk: (chunk) => {
            ownedPid = Number(chunk.toString("utf8").trim());
          },
        });
        expect(ownedPid).toBeGreaterThan(0);
        expect(result.cleanupSafe).toBe(true);
        expect(() => process.kill(-(ownedPid as number), 0)).toThrow();
        await new Promise((resolve) => setTimeout(resolve, 750));
        expect(existsSync(markerPath)).toBe(false);
      } finally {
        if (ownedPid && Number.isInteger(ownedPid)) {
          try {
            process.kill(-ownedPid, "SIGKILL");
          } catch {
            /* The test-owned group already exited. */
          }
        }
      }
    },
  );

  it.skipIf(platform === "win32")(
    "returns explicitly unsafe when group absence cannot be confirmed",
    async () => {
      const directory = tempDirectory();
      const nativeKill = process.kill.bind(process);
      let ownedPid: number | undefined;
      vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
        if (pid < 0 && signal === 0)
          throw Object.assign(new Error("Test probe unavailable"), {
            code: "EPERM",
          });
        return nativeKill(pid, signal);
      });
      try {
        const result = await executeHeadlessChild(
          execPath,
          ["-e", "console.log(process.pid); setInterval(() => {}, 1000);"],
          {
            cwd: directory,
            env: process.env,
            timeoutMs: 100,
            killGraceMs: 20,
            onStdoutChunk: (chunk) => {
              ownedPid = Number(chunk.toString("utf8").trim());
            },
          },
        );
        expect(result.cleanupSafe).toBe(false);
        expect((result.error as NodeJS.ErrnoException)?.code).toBe("ETIMEDOUT");
      } finally {
        vi.restoreAllMocks();
        if (ownedPid && Number.isInteger(ownedPid)) {
          try {
            nativeKill(-ownedPid, "SIGKILL");
          } catch {
            /* The test-owned group already exited. */
          }
        }
      }
    },
  );
});
