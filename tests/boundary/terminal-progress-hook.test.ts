import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it, vi } from "vitest";
import type { AgentExecutionContext } from "../../packages/agent/src/runtime/chat";
import { runStreamingLocalShellCommand } from "../../packages/agent/src/runtime/commands/command-execution/execution";

const executionUrl = pathToFileURL(
  resolve("packages/agent/src/runtime/commands/command-execution/execution.ts"),
).href;
const nubLauncher = createRequire(import.meta.url).resolve(
  "@nubjs/nub/bin/nub",
);

for (const stream of ["onStdout", "onStderr"]) {
  it.each(["throw", "reject", "late-reject"])(
    `contains a %s from ${stream} without changing the command result`,
    (mode) => {
      const script = `
        const { runStreamingLocalShellCommand } = await import(${JSON.stringify(executionUrl)});
        const unhandled = [];
        const warnings = [];
        process.on("unhandledRejection", error => unhandled.push(String(error)));
        const error = new Error("progress sink failed");
        let rejectLate;
        const late = ${JSON.stringify(mode)} === "late-reject"
          ? new Promise((_, reject) => { rejectLate = reject; })
          : undefined;
        let calls = 0;
        const result = {
          command: "fixture", exitCode: 7, stdout: "output", stderr: "warning", durationMs: 3,
        };
        const context = { services: {
          logger: { warn: (...args) => warnings.push(args) },
          terminal: { runStreamingLocal: async (_command, callbacks) => {
            callbacks[${JSON.stringify(stream)}]("first");
            callbacks[${JSON.stringify(stream)}]("second");
            await new Promise(resolve => setImmediate(resolve));
            callbacks[${JSON.stringify(stream)}]("third");
            return result;
          } },
        } };
        const actual = await runStreamingLocalShellCommand("fixture", context, {
          onResponseProgress: () => {
            calls += 1;
            if (${JSON.stringify(mode)} === "throw") throw error;
            return late ?? Promise.reject(error);
          },
        });
        rejectLate?.(error);
        await new Promise(resolve => setImmediate(resolve));
        console.log(JSON.stringify({ actual, unhandled, warnings, calls }));
      `;
      const child = spawnSync(
        process.execPath,
        [nubLauncher, "--no-env-file", "--input-type=module", "-e", script],
        { encoding: "utf8", timeout: 10_000 },
      );
      expect(child.error).toBeUndefined();
      expect(child.status, child.stderr).toBe(0);
      const { actual, unhandled, warnings, calls } = JSON.parse(child.stdout);
      expect(unhandled).toEqual([]);
      expect(actual).toEqual({
        command: "fixture",
        exitCode: 7,
        stdout: "output",
        stderr: "warning",
        durationMs: 3,
      });
      expect(warnings).toEqual([
        [
          "shell-command-progress-failed",
          { detail: expect.stringContaining("progress sink failed") },
        ],
      ]);
      expect(calls).toBe(mode === "throw" ? 1 : mode === "reject" ? 2 : 3);
    },
  );
}

it.each([
  { stdout: "", stderr: "" },
  { stdout: "output", stderr: "warning" },
])(
  "preserves healthy progress and results for %j",
  async ({ stdout, stderr }) => {
    const warn = vi.fn();
    const progress = vi.fn(async () => {});
    const result = {
      command: "fixture",
      exitCode: 0,
      stdout,
      stderr,
      durationMs: 2,
    };
    const context = {
      services: {
        logger: { warn },
        terminal: {
          runStreamingLocal: async (
            _command: string,
            callbacks?: {
              onStdout?: (chunk: string) => void;
              onStderr?: (chunk: string) => void;
            },
          ) => {
            if (stdout) callbacks?.onStdout?.(stdout);
            if (stderr) callbacks?.onStderr?.(stderr);
            return result;
          },
        },
      },
    } as unknown as AgentExecutionContext;
    await expect(
      runStreamingLocalShellCommand("fixture", context, {
        onResponseProgress: progress,
      }),
    ).resolves.toEqual(result);
    expect(progress).toHaveBeenCalledTimes(
      Number(Boolean(stdout)) + Number(Boolean(stderr)),
    );
    expect(warn).not.toHaveBeenCalled();
  },
);

it("does not hide a terminal execution failure", async () => {
  const error = new Error("terminal failed");
  const context = {
    services: {
      terminal: {
        runStreamingLocal: async () => {
          throw error;
        },
      },
    },
  } as unknown as AgentExecutionContext;
  await expect(runStreamingLocalShellCommand("fixture", context)).rejects.toBe(
    error,
  );
});
