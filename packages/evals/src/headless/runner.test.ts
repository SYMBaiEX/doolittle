import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HeadlessEvalSuite } from "./cases";
import { HEADLESS_EVAL_SUITES } from "./cases";
import { runHeadlessEvalSuite } from "./runner";

const temporaryDirectories: string[] = [];

function tempDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), "doolittle-headless-eval-test-"));
  temporaryDirectories.push(path);
  return path;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const path = temporaryDirectories.pop();
    if (path) rmSync(path, { recursive: true, force: true });
  }
});

describe("headless workflow evals", () => {
  it("includes conversational, coding, research, and reliability task coverage", () => {
    const suite = HEADLESS_EVAL_SUITES["headless-workflows-v2"];
    expect(new Set(suite.tasks.map((task) => task.domain))).toEqual(
      new Set(["conversation", "coding", "research", "reliability"]),
    );
  });

  it("saves owner-only reports without prompts or raw responses", () => {
    const response = "a private model answer";
    const reportDir = tempDirectory();
    const execute = vi.fn(() => ({
      status: 0,
      stdout: `${JSON.stringify({ ok: true, text: response })}\n`,
      stderr: "",
      error: undefined,
      signal: null,
    })) as never;
    const suite: HeadlessEvalSuite = {
      id: "privacy-test",
      version: 3,
      title: "Privacy report test",
      tasks: [
        {
          id: "one-shot",
          domain: "conversation",
          prompt: "this prompt must not be persisted",
          checks: [
            {
              id: "returned",
              evaluate: ({ response: value }) => value === response,
            },
          ],
          humanReviewRequired: true,
        },
      ],
    };

    const result = runHeadlessEvalSuite(suite, {
      reportDir,
      taskIds: ["one-shot"],
      repoRoot: process.cwd(),
      execute,
      now: () => new Date("2026-10-01T12:00:00.000Z"),
    });

    const stored = readFileSync(result.reportPath, "utf8");
    expect(result.exitCode).toBe(0);
    expect(stored).not.toContain("this prompt must not be persisted");
    expect(stored).not.toContain(response);
    expect(result.report.runs[0]).toMatchObject({
      status: "completed",
      checks: [{ id: "returned", passed: true }],
      humanReviewRequired: true,
    });
    expect(statSync(result.reportPath).mode & 0o777).toBe(0o600);
  });

  it("enables configured Eliza Cloud only for explicitly opted-in research tasks", () => {
    const reportDir = tempDirectory();
    const environments: NodeJS.ProcessEnv[] = [];
    const previousCloudSetting = process.env.ELIZAOS_CLOUD_ENABLED;
    process.env.ELIZAOS_CLOUD_ENABLED = "true";
    const execute = vi.fn(
      (
        _command: string,
        _args: readonly string[] | string,
        options?: { env?: NodeJS.ProcessEnv },
      ) => {
        if (options?.env) environments.push(options.env);
        return {
          status: 0,
          stdout: `${JSON.stringify({ ok: true, text: "Research result." })}\n`,
          stderr: "",
          error: undefined,
          signal: null,
        };
      },
    );

    let result: ReturnType<typeof runHeadlessEvalSuite>;
    try {
      result = runHeadlessEvalSuite(
        HEADLESS_EVAL_SUITES["headless-workflows-v2"],
        {
          reportDir,
          taskIds: ["research-official-source-v2", "conversation-format-v2"],
          execute: execute as never,
          enableConfiguredCloudResearch: true,
        },
      );
    } finally {
      if (previousCloudSetting === undefined) {
        delete process.env.ELIZAOS_CLOUD_ENABLED;
      } else {
        process.env.ELIZAOS_CLOUD_ENABLED = previousCloudSetting;
      }
    }

    expect(environments[0]?.ELIZAOS_CLOUD_ENABLED).toBe("false");
    expect(environments[1]?.ELIZAOS_CLOUD_ENABLED).toBe("true");
    expect(result.report.executionOverrides).toEqual([
      "Eliza Cloud enabled only for research-domain tasks; credentials remain in the configured environment.",
    ]);
  });

  it("disables Eliza Cloud in isolated runs unless research is explicitly opted in", () => {
    const previousCloudSetting = process.env.ELIZAOS_CLOUD_ENABLED;
    process.env.ELIZAOS_CLOUD_ENABLED = "true";
    let childEnvironment: NodeJS.ProcessEnv | undefined;
    const execute = vi.fn(
      (
        _command: string,
        _args: readonly string[] | string,
        options?: { env?: NodeJS.ProcessEnv },
      ) => {
        childEnvironment = options?.env;
        return {
          status: 0,
          stdout: `${JSON.stringify({ ok: true, text: "Research result." })}\n`,
          stderr: "",
          error: undefined,
          signal: null,
        };
      },
    );

    try {
      const result = runHeadlessEvalSuite(
        HEADLESS_EVAL_SUITES["headless-workflows-v2"],
        {
          reportDir: tempDirectory(),
          taskIds: ["research-official-source-v2"],
          execute: execute as never,
        },
      );
      expect(childEnvironment?.ELIZAOS_CLOUD_ENABLED).toBe("false");
      expect(result.report.executionOverrides).toEqual([]);
    } finally {
      if (previousCloudSetting === undefined) {
        delete process.env.ELIZAOS_CLOUD_ENABLED;
      } else {
        process.env.ELIZAOS_CLOUD_ENABLED = previousCloudSetting;
      }
    }
  });

  it("rejects unknown task selectors before executing a model", () => {
    const execute = vi.fn();
    expect(() =>
      runHeadlessEvalSuite(HEADLESS_EVAL_SUITES["headless-workflows-v2"], {
        taskIds: ["not-a-task"],
        execute: execute as never,
      }),
    ).toThrow("Unknown task ID");
    expect(execute).not.toHaveBeenCalled();
  });
});
