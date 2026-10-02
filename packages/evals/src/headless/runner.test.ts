import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
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
    const expanded = HEADLESS_EVAL_SUITES["headless-workflows-v3"];
    expect(expanded.tasks.length).toBeGreaterThan(suite.tasks.length);
    expect(expanded.tasks.some((task) => task.followUpPrompts?.length)).toBe(
      true,
    );
    expect(HEADLESS_EVAL_SUITES["headless-workflows-v4"].version).toBe(4);
    expect(HEADLESS_EVAL_SUITES["headless-workflows-v4"].tasks.length).toBe(
      expanded.tasks.length,
    );
  });

  it("does not count ACP identity files as coding-task artifacts", () => {
    const workspaceDir = join(tempDirectory(), "workspace");
    mkdirSync(workspaceDir);
    writeFileSync(
      join(workspaceDir, "math.mjs"),
      "export function sumFinite() {}\n",
    );
    writeFileSync(join(workspaceDir, "AGENTS.md"), "harness identity\n");
    writeFileSync(join(workspaceDir, "CLAUDE.md"), "harness identity\n");

    const task = HEADLESS_EVAL_SUITES["headless-workflows-v4"].tasks.find(
      (candidate) => candidate.id === "coding-function-behavior-v4",
    );
    const check = task?.checks.find(
      (candidate) => candidate.id === "only-requested-file-created",
    );
    expect(check).toBeDefined();
    const context = { response: "", responses: [], workspaceDir };
    expect(check?.evaluate(context)).toBe(true);

    writeFileSync(join(workspaceDir, "notes.txt"), "unexpected task file\n");
    expect(check?.evaluate(context)).toBe(false);
  });

  it("saves owner-only reports without prompts or raw responses", async () => {
    const response = "a private model answer";
    const reportDir = tempDirectory();
    let childArguments: readonly string[] | string | undefined;
    let childEnvironment: NodeJS.ProcessEnv | undefined;
    const execute = vi.fn(
      (
        _command: string,
        args: readonly string[] | string,
        options?: { env?: NodeJS.ProcessEnv },
      ) => {
        childArguments = args;
        childEnvironment = options?.env;
        const dataDir = childEnvironment?.DOOLITTLE_DATA_DIR;
        if (dataDir) {
          mkdirSync(join(dataDir, "trajectories"), { recursive: true });
          writeFileSync(
            join(dataDir, "eval-model-calls.jsonl"),
            `${JSON.stringify({
              provider: "codex",
              completed: true,
              providerDurationMs: 42,
              firstTextMs: 17,
              inputTokens: 120,
              outputTokens: 24,
              totalTokens: 144,
              prompt: "must not be copied into the report",
            })}\n`,
          );
          writeFileSync(
            join(dataDir, "trajectories", "trajectory-events.jsonl"),
            [
              {
                category: "model",
                event: "model.request",
                text: "private prompt text must not be retained",
                metadata: { prompt: "private prompt", promptChars: 123 },
              },
              {
                category: "model",
                event: "model.continuation",
                text: "private tool output must not be retained",
                metadata: {
                  reason: "unverified-terminal-response",
                  attempt: 2,
                  actionNames: ["private action arguments"],
                },
              },
              {
                category: "model",
                event: "model.response",
                text: "private answer",
              },
            ]
              .map((event) => JSON.stringify(event))
              .join("\n"),
          );
        }
        return {
          status: 0,
          stdout: [
            {
              type: "start",
              sessionId: "private-session",
              command: "private prompt",
            },
            {
              type: "progress",
              phase: "model",
              chunk: response,
              response,
              delta: response,
            },
            {
              type: "result",
              text: response,
              tone: "agent",
              shouldExit: false,
            },
            { type: "completed", status: "completed" },
          ]
            .map((event) => JSON.stringify(event))
            .join("\n"),
          stderr: "",
          error: undefined,
          signal: null,
        };
      },
    ) as never;
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

    const result = await runHeadlessEvalSuite(suite, {
      reportDir,
      taskIds: ["one-shot"],
      repoRoot: process.cwd(),
      execute,
      now: () => new Date("2026-10-01T12:00:00.000Z"),
    });

    const stored = readFileSync(result.reportPath, "utf8");
    expect(result.exitCode).toBe(0);
    expect(childArguments).toContain("--json-stream");
    expect(stored).not.toContain("this prompt must not be persisted");
    expect(stored).not.toContain(response);
    expect(result.report.runs[0]).toMatchObject({
      status: "completed",
      checks: [{ id: "returned", passed: true }],
      humanReviewRequired: true,
    });
    expect(result.report.schemaVersion).toBe(4);
    expect(result.report.source.revision).toMatch(/^[a-f0-9]{40}$/i);
    expect(result.report.runs[0]?.traceSummary).toEqual({
      journalAvailable: true,
      malformed: false,
      modelRequests: 1,
      modelResponses: 1,
      modelErrors: 0,
      mutationContinuations: 1,
      continuationReasons: {
        "explicitly-incomplete-response": 0,
        "unverified-terminal-response": 1,
        "empty-terminal-response": 0,
      },
      maxContinuationAttempt: 2,
      promptChars: { samples: 1, min: 123, max: 123, mean: 123 },
    });
    expect(result.report.evaluatorVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(childEnvironment?.DOOLITTLE_EVAL_CAPTURE_MODEL_USAGE).toBe("true");
    expect(result.report.runs[0]?.modelUsage).toEqual({
      provider: "codex",
      providerCalls: 1,
      completedCalls: 1,
      failedCalls: 0,
      providerDurationMs: 42,
      firstTextSamples: 1,
      meanFirstTextMs: 17,
      tokenUsageSamples: 1,
      inputTokens: 120,
      outputTokens: 24,
      totalTokens: 144,
      costUsd: null,
    });
    expect(stored).not.toContain("must not be copied into the report");
    expect(stored).not.toContain("private prompt text");
    expect(stored).not.toContain("private action arguments");
    expect(result.report.runs[0]?.timing).toEqual({
      taskSetupMs: expect.any(Number),
      execDurationMs: expect.any(Number),
      execInvocations: 1,
      gradingMs: expect.any(Number),
    });
    expect(statSync(result.reportPath).mode & 0o777).toBe(0o600);
  });

  it("does not treat a result frame without stream completion as a successful run", async () => {
    const suite: HeadlessEvalSuite = {
      id: "stream-completion-test",
      version: 1,
      title: "Stream completion test",
      tasks: [
        {
          id: "one-shot",
          domain: "conversation",
          prompt: "private prompt",
          checks: [
            {
              id: "non-empty",
              evaluate: ({ response }) => response.length > 0,
            },
          ],
          humanReviewRequired: false,
        },
      ],
    };
    const result = await runHeadlessEvalSuite(suite, {
      reportDir: tempDirectory(),
      taskIds: ["one-shot"],
      execute: (() => ({
        status: 0,
        stdout: `${JSON.stringify({ type: "result", text: "partial", shouldExit: false })}\n`,
        stderr: "",
        error: undefined,
        signal: null,
      })) as never,
    });

    expect(result.exitCode).toBe(1);
    expect(result.report.runs[0]).toMatchObject({ status: "failed" });
  });

  it("measures setup, whole doolittle exec, grading, and suite wall time monotonically", async () => {
    let clock = 0;
    const reportDir = tempDirectory();
    const suite: HeadlessEvalSuite = {
      id: "timing-test",
      version: 1,
      title: "Timing test",
      tasks: [
        {
          id: "one-shot",
          domain: "conversation",
          prompt: "private prompt",
          checks: [
            {
              id: "returned",
              evaluate: () => {
                clock += 40;
                return true;
              },
            },
          ],
          humanReviewRequired: false,
        },
      ],
    };
    const result = await runHeadlessEvalSuite(suite, {
      reportDir,
      monotonicNow: () => clock,
      execute: (() => {
        // Deliberately includes all synchronous child invocation time; it is
        // not a model-only measurement.
        clock += 125;
        return {
          status: 0,
          stdout: `${JSON.stringify({ ok: true, text: "private response" })}\n`,
          stderr: "",
          error: undefined,
          signal: null,
        };
      }) as never,
    });

    expect(result.report.runs[0]?.timing).toEqual({
      taskSetupMs: 0,
      execDurationMs: 125,
      execInvocations: 1,
      gradingMs: 40,
    });
    expect(result.report.summary.suiteWallTimeMs).toBe(165);
    const stored = readFileSync(result.reportPath, "utf8");
    expect(stored).not.toContain("private prompt");
    expect(stored).not.toContain("private response");
    expect(stored).not.toContain(reportDir);
    expect(stored).not.toContain(process.cwd());
  });

  it("runs follow-up turns in one isolated session and checks the final context", async () => {
    let clock = 0;
    const reportDir = tempDirectory();
    const callArgs: Array<readonly string[] | string> = [];
    const dataDirs: string[] = [];
    const suite: HeadlessEvalSuite = {
      id: "multi-turn-test",
      version: 1,
      title: "Multi-turn test",
      tasks: [
        {
          id: "remember-room",
          domain: "conversation",
          prompt: "Remember room Cedar-41.",
          followUpPrompts: ["Which room?"],
          checks: [
            {
              id: "retains-prior-turn",
              evaluate: ({ response, responses }) =>
                responses.length === 2 && response === "Room: Cedar-41",
            },
          ],
          humanReviewRequired: true,
        },
      ],
    };
    const result = await runHeadlessEvalSuite(suite, {
      reportDir,
      taskIds: ["remember-room"],
      monotonicNow: () => clock,
      execute: ((
        _command: string,
        args: readonly string[] | string,
        options?: { env?: NodeJS.ProcessEnv },
      ) => {
        const normalizedArgs = Array.isArray(args) ? args : [args];
        callArgs.push(normalizedArgs);
        const environment = options?.env as NodeJS.ProcessEnv | undefined;
        if (environment?.DOOLITTLE_DATA_DIR) {
          dataDirs.push(environment.DOOLITTLE_DATA_DIR);
        }
        const response = normalizedArgs.includes("Remember room Cedar-41.")
          ? "I will remember Cedar-41."
          : "Room: Cedar-41";
        clock += 25;
        return {
          status: 0,
          stdout: [
            { type: "result", text: response, shouldExit: false },
            { type: "completed", status: "completed" },
          ]
            .map((event) => JSON.stringify(event))
            .join("\n"),
          stderr: "",
          error: undefined,
          signal: null,
        };
      }) as never,
    });

    const sessionIds = callArgs.map((args) => {
      const index = args.indexOf("--session-id");
      return index >= 0 ? args[index + 1] : undefined;
    });
    expect(new Set(sessionIds).size).toBe(1);
    expect(sessionIds[0]).toMatch(/^doolittle-eval:/);
    expect(dataDirs[0]).toBe(dataDirs[1]);
    expect(result.report.runs[0]).toMatchObject({
      status: "completed",
      responseSha256s: [expect.any(String), expect.any(String)],
      timing: { execDurationMs: 50, execInvocations: 2 },
      checks: [{ id: "retains-prior-turn", passed: true }],
    });
    const stored = readFileSync(result.reportPath, "utf8");
    expect(stored).not.toContain("Remember room Cedar-41.");
    expect(stored).not.toContain("Room: Cedar-41");
  });

  it("marks malformed provider telemetry without persisting its contents", async () => {
    const reportDir = tempDirectory();
    const execute = vi.fn(
      (
        _command: string,
        _args: readonly string[] | string,
        options?: { env?: NodeJS.ProcessEnv },
      ) => {
        const dataDir = options?.env?.DOOLITTLE_DATA_DIR;
        if (dataDir) {
          writeFileSync(
            join(dataDir, "eval-model-calls.jsonl"),
            `${JSON.stringify({ provider: "unknown", privateData: "drop" })}\n`,
          );
        }
        return {
          status: 0,
          stdout: `${JSON.stringify({ ok: true, text: "private answer" })}\n`,
          stderr: "",
          error: undefined,
          signal: null,
        };
      },
    ) as never;
    const suite: HeadlessEvalSuite = {
      id: "telemetry-validation",
      version: 1,
      title: "Telemetry validation",
      tasks: [
        {
          id: "one-shot",
          domain: "conversation",
          prompt: "private prompt",
          checks: [{ id: "always", evaluate: () => true }],
          humanReviewRequired: false,
        },
      ],
    };

    const result = await runHeadlessEvalSuite(suite, {
      reportDir,
      taskIds: ["one-shot"],
      execute,
    });
    const stored = readFileSync(result.reportPath, "utf8");
    expect(result.report.runs[0]?.modelUsage).toBeNull();
    expect(result.report.runs[0]?.diagnosticFlags).toContain(
      "model-usage-telemetry-invalid",
    );
    expect(result.report.runs[0]?.diagnosticFlags).toContain(
      "trajectory-telemetry-unavailable",
    );
    expect(stored).not.toContain("privateData");
    expect(stored).not.toContain("private prompt");
    expect(stored).not.toContain("private answer");
  });

  it("enables configured Eliza Cloud only for explicitly opted-in research tasks", async () => {
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

    let result: Awaited<ReturnType<typeof runHeadlessEvalSuite>>;
    try {
      result = await runHeadlessEvalSuite(
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

  it("flags failed research-provider authentication without persisting the response", async () => {
    const reportDir = tempDirectory();
    const rawResponse =
      'Deep research failed: Research API error: 401 {"error":{"message":"Authentication required.","code":"authentication_required"}}';
    const suite: HeadlessEvalSuite = {
      id: "research-availability",
      version: 1,
      title: "Research availability",
      tasks: [
        {
          id: "research-auth-failure",
          domain: "research",
          prompt: "private research prompt",
          checks: [
            {
              id: "research-result",
              evaluate: ({ response }) => response.includes("official source"),
            },
          ],
          humanReviewRequired: true,
        },
      ],
    };
    const execute = vi.fn(
      (
        _command: string,
        _args: readonly string[] | string,
        options?: { env?: NodeJS.ProcessEnv },
      ) => {
        const dataDir = options?.env?.DOOLITTLE_DATA_DIR;
        if (dataDir) {
          const trajectoryDirectory = join(dataDir, "trajectories");
          mkdirSync(trajectoryDirectory, { recursive: true });
          writeFileSync(
            join(trajectoryDirectory, "trajectory-events.jsonl"),
            `${JSON.stringify({
              category: "action",
              event: "action.completed",
              metadata: {
                action: "DOOLITTLE_RESEARCH",
                success: false,
                actionResult: { text: rawResponse },
              },
            })}\n`,
          );
        }
        return {
          status: 0,
          stdout: `${JSON.stringify({ ok: true, text: rawResponse })}\n`,
          stderr: "",
          error: undefined,
          signal: null,
        };
      },
    ) as never;

    const result = await runHeadlessEvalSuite(suite, {
      reportDir,
      execute,
    });
    const stored = readFileSync(result.reportPath, "utf8");

    expect(result.report.runs[0]).toMatchObject({
      status: "completed",
      diagnosticFlags: ["research-provider-authentication-failed"],
      checks: [{ id: "research-result", passed: false }],
    });
    expect(stored).toContain("research-provider-authentication-failed");
    expect(stored).not.toContain("Authentication required");
    expect(stored).not.toContain("private research prompt");
  });

  it("detects a direct research error when the action event is not journaled", async () => {
    const suite: HeadlessEvalSuite = {
      id: "research-availability",
      version: 1,
      title: "Research availability",
      tasks: [
        {
          id: "research-prose-only",
          domain: "research",
          prompt: "private research prompt",
          checks: [{ id: "research-result", evaluate: () => false }],
          humanReviewRequired: true,
        },
      ],
    };
    const execute = vi.fn(() => ({
      status: 0,
      stdout: `${JSON.stringify({
        ok: true,
        text: "Deep research failed: I could not find a source.",
      })}\n`,
      stderr: "",
      error: undefined,
      signal: null,
    })) as never;

    const result = await runHeadlessEvalSuite(suite, {
      reportDir: tempDirectory(),
      execute,
    });

    expect(result.report.runs[0]?.diagnosticFlags).toContain(
      "research-provider-unavailable",
    );
  });

  it("disables Eliza Cloud in isolated runs unless research is explicitly opted in", async () => {
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
      const result = await runHeadlessEvalSuite(
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

  it("rejects unknown task selectors before executing a model", async () => {
    const execute = vi.fn();
    await expect(
      runHeadlessEvalSuite(HEADLESS_EVAL_SUITES["headless-workflows-v2"], {
        taskIds: ["not-a-task"],
        execute: execute as never,
      }),
    ).rejects.toThrow("Unknown task ID");
    expect(execute).not.toHaveBeenCalled();
  });
});
