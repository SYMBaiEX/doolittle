import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { executeHeadlessChild } from "../../packages/evals/src/headless/process";
import { isolatedRuntimeEnvironment } from "../support/isolated-runtime-environment";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function options() {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-headless-child-test-")),
  );
  roots.push(root);
  return {
    cwd: root,
    env: isolatedRuntimeEnvironment(root),
    timeoutMs: 3000,
    killGraceMs: 100,
  };
}

const posix = it.skipIf(process.platform === "win32");

posix(
  "captures stdout/stderr and isolates observer failures from successful execution",
  async () => {
    const chunks: string[] = [];
    const result = await executeHeadlessChild(
      process.execPath,
      [
        "-e",
        "process.stdout.write('ready'); process.stderr.write('diagnostic');",
      ],
      {
        ...options(),
        onStdoutChunk: (chunk) => {
          chunks.push(chunk.toString());
          throw new Error("observer failure");
        },
      },
    );
    expect(result).toMatchObject({
      status: 0,
      stdout: "ready",
      stderr: "diagnostic",
      signal: null,
      cleanupSafe: true,
    });
    expect(result.error).toBeUndefined();
    expect(chunks.join("")).toBe("ready");
  },
);

posix(
  "preserves a nonzero exit and accepts an empty successful output",
  async () => {
    const failed = await executeHeadlessChild(
      process.execPath,
      ["-e", "process.exitCode = 7"],
      options(),
    );
    expect(failed).toMatchObject({ status: 7, stdout: "", cleanupSafe: true });
    const empty = await executeHeadlessChild(
      process.execPath,
      ["-e", ""],
      options(),
    );
    expect(empty).toMatchObject({
      status: 0,
      stdout: "",
      stderr: "",
      cleanupSafe: true,
    });
  },
);

posix("times out a live child and confirms it no longer exists", async () => {
  const result = await executeHeadlessChild(
    process.execPath,
    ["-e", "console.log(process.pid); setInterval(() => {}, 1000);"],
    { ...options(), timeoutMs: 2000 },
  );
  expect(result.error).toMatchObject({ code: "ETIMEDOUT" });
  expect(result.cleanupSafe).toBe(true);
  const pid = Number(result.stdout.trim());
  expect(pid).toBeGreaterThan(0);
  expect(() => process.kill(pid, 0)).toThrow();
});

posix("bounds output and cleans up the producing process", async () => {
  const result = await executeHeadlessChild(
    process.execPath,
    [
      "-e",
      "process.stdout.write('x'.repeat(8192)); setInterval(() => {}, 1000);",
    ],
    { ...options(), maxBufferBytes: 64 },
  );
  expect(result.error).toMatchObject({
    code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
  });
  expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(64);
  expect(result.cleanupSafe).toBe(true);
});

it("returns a failed-spawn error without creating a child", async () => {
  const childOptions = options();
  const missing = join(childOptions.cwd, "missing-executable");
  expect(existsSync(missing)).toBe(false);
  const result = await executeHeadlessChild(missing, [], childOptions);
  expect(result.error).toMatchObject({ code: "ENOENT" });
  expect(result.cleanupSafe).toBe(true);
  expect(result.stdout).toBe("");
});
