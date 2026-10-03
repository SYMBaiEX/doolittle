import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import * as accountAuth from "@doolittle/agent/runtime/native/account-auth";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HeadlessEvalSuite } from "./cases";
import { HEADLESS_EVAL_SUITES } from "./cases";
import {
  CODING_VERIFICATION_COMMAND,
  CODING_VERIFICATION_FLAG,
  CODING_VERIFICATION_ID,
  CODING_VERIFICATION_SUCCESS_MARKER,
} from "./coding-verification";
import {
  PLANNER_ALIAS_TOOL_DEDUPLICATION_FLAG,
  PLANNER_ALIAS_TOOL_DEDUPLICATION_OVERRIDE,
} from "./execution-overrides";
import * as measurement from "./measurement";
import * as modelInputObservations from "./model-input-observations";
import * as researchGrounding from "./research-grounding";
import { runHeadlessEvalSuite } from "./runner";

const temporaryDirectories: string[] = [];

describe("optional first-runtime model input receipts", () => {
  const suite: HeadlessEvalSuite = {
    id: "model-input-test",
    version: 1,
    title: "Synthetic observations",
    tasks: [
      {
        id: "one",
        domain: "conversation",
        prompt: "synthetic",
        followUpPrompts: ["synthetic follow-up"],
        checks: [{ id: "pass", evaluate: () => true }],
        humanReviewRequired: false,
      },
    ],
  };
  const success = {
    status: 0,
    stdout: JSON.stringify({ ok: true, text: "PRIVATE_RESPONSE_CANARY" }),
    stderr: "",
    signal: null,
    cleanupSafe: true,
  };
  const row = {
    version: 1,
    phase: "unknown",
    priorSinkMs: 0,
    kind: "input",
    ordinal: 1,
    slot: "TEXT_LARGE",
    requestedSlot: "TEXT_LARGE",
    provider: "codex",
    systemChars: 10,
    promptChars: 20,
    messageTextChars: null,
    messageCount: null,
    imageCount: null,
    toolCount: null,
    toolSchemaChars: null,
    requestedStreaming: true,
    partial: false,
    projectionMs: 0.1,
  };
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  function writeObservation(dataDir: string) {
    const bytes = `${JSON.stringify(row)}\n`;
    writeFileSync(
      join(dataDir, modelInputObservations.MODEL_INPUT_FILE),
      bytes,
      { mode: 0o600, flag: "wx" },
    );
    return bytes;
  }
  it.each([undefined, false])(
    "defaults off and shadows inherited opt-in on every CLI invocation: %s",
    async (recordModelInputs) => {
      vi.stubEnv(modelInputObservations.MODEL_INPUT_FLAG, "true");
      const reader = vi.spyOn(
        modelInputObservations,
        "readModelInputObservations",
      );
      const pin = vi.spyOn(modelInputObservations, "pinModelInputDataRoot");
      const writer = vi.fn();
      let calls = 0;
      const reportDir = tempDirectory();
      const result = await runHeadlessEvalSuite(suite, {
        reportDir,
        recordModelInputs,
        writeModelInputReceipt: writer,
        execute: (_command, _args, options) => {
          calls++;
          expect(options.env[modelInputObservations.MODEL_INPUT_FLAG]).toBe(
            "false",
          );
          return success;
        },
      });
      expect(calls).toBe(2);
      expect(result.modelInputReceiptStatus).toBe("disabled");
      expect(result.report.executionOverrides).toEqual([]);
      expect(reader).not.toHaveBeenCalled();
      expect(pin).not.toHaveBeenCalled();
      expect(writer).not.toHaveBeenCalled();
      expect(
        readdirSync(reportDir).some((leaf) =>
          leaf.endsWith(".model-inputs.json"),
        ),
      ).toBe(false);
    },
  );
  it("creates canonical child roots even when tmpdir is a system-style alias", async () => {
    const parent = tempDirectory();
    const canonical = join(parent, "canonical");
    const alias = join(parent, "alias");
    mkdirSync(canonical, { mode: 0o700 });
    symlinkSync(canonical, alias);
    vi.stubEnv("TMPDIR", alias);
    const result = await runHeadlessEvalSuite(
      { ...suite, tasks: [{ ...suite.tasks[0], followUpPrompts: [] }] },
      {
        reportDir: tempDirectory(),
        recordModelInputs: true,
        execute: (_command, _args, options) => {
          const dataDir = options.env.DOOLITTLE_DATA_DIR;
          if (!dataDir) throw new Error("Missing synthetic data.");
          expect(dataDir).toBe(realpathSync(dataDir));
          expect(dirname(dirname(dirname(dataDir)))).toBe(canonical);
          writeObservation(dataDir);
          return success;
        },
      },
    );
    expect(result.modelInputReceiptStatus).toBe("written");
    expect(result.exitCode).toBe(0);
  });
  it("retains the first snapshot before cleanup, binds exact report SHA/index and excludes later shared-data invocations", async () => {
    const reportDir = tempDirectory();
    const reader = vi.spyOn(
      modelInputObservations,
      "readModelInputObservations",
    );
    const observedRoots: string[] = [];
    const firstBytes: string[] = [];
    let calls = 0;
    const secondTask = { ...suite.tasks[0], id: "two" };
    const result = await runHeadlessEvalSuite(
      { ...suite, tasks: [...suite.tasks, secondTask] },
      {
        reportDir,
        recordModelInputs: true,
        execute: (_command, _args, options) => {
          const dataDir = options.env.DOOLITTLE_DATA_DIR;
          if (!dataDir) throw new Error("Missing synthetic data.");
          expect(options.env[modelInputObservations.MODEL_INPUT_FLAG]).toBe(
            "true",
          );
          if (calls++ % 2 === 0) {
            expect(observedRoots.every((root) => !existsSync(root))).toBe(true);
            observedRoots.push(dirname(dataDir));
            firstBytes.push(writeObservation(dataDir));
          } else {
            // A later invocation must not be adopted as a new measured runtime,
            // even if it modifies shared bytes after the original snapshot.
            writeFileSync(
              join(dataDir, modelInputObservations.MODEL_INPUT_FILE),
              JSON.stringify({ ...row, promptChars: 999 }),
            );
          }
          return success;
        },
      },
    );
    expect(calls).toBe(4);
    expect(reader).toHaveBeenCalledTimes(2);
    expect(observedRoots.every((root) => !existsSync(root))).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.modelInputReceiptStatus).toBe("written");
    expect(result.report.executionOverrides).toEqual([
      expect.stringContaining("first-creating-runtime-only"),
    ]);
    expect(dirname(result.reportPath)).toBe(reportDir);
    const path = join(reportDir, basename(result.reportPath));
    const receiptBytes = readFileSync(`${path}.model-inputs.json`, "utf8");
    const receipt = JSON.parse(receiptBytes);
    expect(receipt).toMatchObject({
      schemaVersion: 1,
      reportSchemaVersion: 5,
      evaluatorVersion: "0.2.12",
      reportSha256: measurement.digest(readFileSync(path, "utf8")),
      coverage: "first-creating-runtime-only",
    });
    expect(receipt.runs).toEqual(
      firstBytes.map((bytes, reportRunIndex) =>
        expect.objectContaining({
          reportRunIndex,
          cliInvocations: 2,
          observations: expect.objectContaining({
            status: "complete",
            sourceSha256: measurement.digest(bytes),
            rows: [row],
          }),
        }),
      ),
    );
    expect(statSync(`${path}.model-inputs.json`).mode & 0o777).toBe(0o600);
    expect(receiptBytes).not.toContain("PRIVATE_RESPONSE_CANARY");
    for (const root of observedRoots) expect(receiptBytes).not.toContain(root);
  });
  it.each(["missing", "unknown", "replacement", "later-only"])(
    "keeps grading/cleanup unchanged with %s evidence",
    async (kind) => {
      const reportDir = tempDirectory();
      let calls = 0;
      let taskRoot = "";
      const result = await runHeadlessEvalSuite(suite, {
        reportDir,
        recordModelInputs: true,
        execute: (_command, _args, options) => {
          const dataDir = options.env.DOOLITTLE_DATA_DIR;
          if (!dataDir) throw new Error("Missing synthetic data.");
          taskRoot = dirname(dataDir);
          if (calls++ === 0) {
            if (kind === "unknown")
              writeFileSync(
                join(dataDir, modelInputObservations.MODEL_INPUT_FILE),
                `${JSON.stringify({ ...row, unknown: "PRIVATE_UNKNOWN_CANARY" })}\n`,
                { mode: 0o600 },
              );
            if (kind === "replacement") {
              renameSync(dataDir, join(taskRoot, "original-data"));
              mkdirSync(dataDir, { mode: 0o700 });
              writeObservation(dataDir);
            }
          } else if (kind === "later-only") writeObservation(dataDir);
          return success;
        },
      });
      expect(result.exitCode).toBe(0);
      expect(existsSync(taskRoot)).toBe(false);
      expect(result.modelInputReceiptStatus).toBe("written");
      const path = join(
        reportDir,
        `${basename(result.reportPath)}.model-inputs.json`,
      );
      const stored = readFileSync(path, "utf8");
      expect(stored).not.toContain("PRIVATE_UNKNOWN_CANARY");
      expect(JSON.parse(stored).runs[0].observations).toMatchObject({
        status: kind === "unknown" ? "partial" : "unavailable",
        rows: [],
      });
    },
  );
  it("does not read observer bytes or start follow-ups when owned child cleanup is unconfirmed", async () => {
    const reportDir = tempDirectory();
    const reader = vi.spyOn(
      modelInputObservations,
      "readModelInputObservations",
    );
    let taskRoot = "";
    let calls = 0;
    await expect(
      runHeadlessEvalSuite(suite, {
        reportDir,
        recordModelInputs: true,
        execute: (_command, _args, options) => {
          const dataDir = options.env.DOOLITTLE_DATA_DIR;
          if (!dataDir) throw new Error("Missing synthetic data.");
          taskRoot = dirname(dataDir);
          temporaryDirectories.push(dirname(taskRoot));
          writeObservation(dataDir);
          calls++;
          return { ...success, cleanupSafe: false };
        },
      }),
    ).rejects.toThrow("cleanup could not be confirmed");
    expect(calls).toBe(1);
    expect(reader).not.toHaveBeenCalled();
    expect(existsSync(taskRoot)).toBe(true);
    expect(readdirSync(reportDir)).toEqual([]);
  });
  it.each(["throw", "reject", "pending"])(
    "isolates optional %s writer failure without awaiting it",
    async (kind) => {
      let taskRoot = "";
      const result = await runHeadlessEvalSuite(suite, {
        reportDir: tempDirectory(),
        recordModelInputs: true,
        writeModelInputReceipt: () => {
          if (kind === "throw") throw new Error("PRIVATE_WRITER_CANARY");
          return kind === "reject"
            ? Promise.reject(new Error("PRIVATE_WRITER_CANARY"))
            : new Promise<void>(() => {});
        },
        execute: (_command, _args, options) => {
          taskRoot = dirname(options.env.DOOLITTLE_DATA_DIR ?? "");
          return success;
        },
      });
      expect(result.exitCode).toBe(0);
      expect(result.modelInputReceiptStatus).toBe("unavailable");
      expect(existsSync(taskRoot)).toBe(false);
      expect(JSON.stringify(result.report)).not.toContain(
        "PRIVATE_WRITER_CANARY",
      );
    },
  );
  it.each(["collision", "symlink"])(
    "preserves a preexisting %s sidecar and grading",
    async (kind) => {
      const reportDir = tempDirectory();
      const foreign = join(tempDirectory(), "foreign");
      writeFileSync(foreign, "PRIVATE_FOREIGN_CANARY", { mode: 0o600 });
      const result = await runHeadlessEvalSuite(suite, {
        reportDir,
        recordModelInputs: true,
        execute: () => success,
        writeMeasurementReceipt: (path) => {
          const leaf = basename(path).replace(
            /\.measurement\.json$/u,
            ".model-inputs.json",
          );
          if (kind === "symlink") symlinkSync(foreign, join(reportDir, leaf));
          else
            writeFileSync(join(reportDir, leaf), "PRIVATE_EXISTING_CANARY", {
              mode: 0o600,
              flag: "wx",
            });
        },
      });
      expect(result.exitCode).toBe(0);
      expect(result.modelInputReceiptStatus).toBe("unavailable");
      expect(readFileSync(foreign, "utf8")).toBe("PRIVATE_FOREIGN_CANARY");
      expect(
        readFileSync(
          join(reportDir, `${basename(result.reportPath)}.model-inputs.json`),
          "utf8",
        ),
      ).toBe(
        kind === "symlink"
          ? "PRIVATE_FOREIGN_CANARY"
          : "PRIVATE_EXISTING_CANARY",
      );
    },
  );
  it("refuses a substituted report directory after an injected write without claiming persistence", async () => {
    const parent = tempDirectory();
    const reportDir = join(parent, "reports");
    mkdirSync(reportDir, { mode: 0o700 });
    const result = await runHeadlessEvalSuite(suite, {
      reportDir,
      recordModelInputs: true,
      execute: () => success,
      writeModelInputReceipt: () => {
        renameSync(reportDir, join(parent, "original-reports"));
        mkdirSync(reportDir, { mode: 0o700 });
      },
    });
    expect(result.exitCode).toBe(0);
    expect(result.modelInputReceiptStatus).toBe("unavailable");
  });
});

describe("headless planner alias deduplication opt-in", () => {
  const suite: HeadlessEvalSuite = {
    id: "planner-dedup-opt-in-test",
    version: 1,
    title: "Synthetic planner deduplication option",
    tasks: [
      {
        id: "one",
        domain: "conversation",
        prompt: "synthetic",
        followUpPrompts: ["synthetic follow-up"],
        checks: [{ id: "pass", evaluate: () => true }],
        humanReviewRequired: false,
      },
    ],
  };
  const success = {
    status: 0,
    stdout: JSON.stringify({ ok: true, text: "Synthetic response." }),
    stderr: "",
    signal: null,
    cleanupSafe: true,
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(["true", "false"])(
    "forces the disabled default on every child despite inherited %s",
    async (ambientValue) => {
      vi.stubEnv(PLANNER_ALIAS_TOOL_DEDUPLICATION_FLAG, ambientValue);
      let calls = 0;
      const result = await runHeadlessEvalSuite(suite, {
        reportDir: tempDirectory(),
        execute: (_command, _args, options) => {
          calls++;
          expect(options.env[PLANNER_ALIAS_TOOL_DEDUPLICATION_FLAG]).toBe(
            "false",
          );
          return success;
        },
      });

      expect(calls).toBe(2);
      expect(result.report.executionOverrides).toEqual([]);
    },
  );

  it("sets every child explicitly on and records only the fixed enabled marker", async () => {
    vi.stubEnv(
      PLANNER_ALIAS_TOOL_DEDUPLICATION_FLAG,
      "PRIVATE_PLANNER_FLAG_CANARY",
    );
    let calls = 0;
    const result = await runHeadlessEvalSuite(suite, {
      reportDir: tempDirectory(),
      deduplicatePlannerAliasTools: true,
      recordActionDiagnostics: true,
      recordModelInputs: true,
      execute: (_command, _args, options) => {
        calls++;
        expect(options.env[PLANNER_ALIAS_TOOL_DEDUPLICATION_FLAG]).toBe("true");
        return success;
      },
    });

    expect(calls).toBe(2);
    expect(result.report.executionOverrides).toEqual([
      "Action diagnostics enabled: grading includes a bounded journal-event projection; the separate action receipt does not identify distinct commands or causal failures.",
      expect.stringContaining("first-creating-runtime-only"),
      PLANNER_ALIAS_TOOL_DEDUPLICATION_OVERRIDE,
    ]);
    expect(JSON.stringify(result.report)).not.toContain(
      "PRIVATE_PLANNER_FLAG_CANARY",
    );
  });
});

function tempDirectory(): string {
  const path = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-headless-eval-test-")),
  );
  temporaryDirectories.push(path);
  return path;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const path = temporaryDirectories.pop();
    if (path) rmSync(path, { recursive: true, force: true });
  }
});

describe("separately identified SDK-web research grading", () => {
  const suite = HEADLESS_EVAL_SUITES["headless-sdk-web-research-v1"];
  const legacyPrompt = HEADLESS_EVAL_SUITES["headless-workflows-v6"].tasks.find(
    (task) => task.domain === "research",
  )?.prompt;
  const success = {
    status: 0,
    stdout: "",
    stderr: "",
    signal: null,
    cleanupSafe: true,
  };
  function evidence(
    dataDir: string,
    searchValue?: string,
    citation: unknown = researchGrounding.SDK_WEB_RESEARCH_SOURCE,
  ) {
    const source =
      'export type WebSearchMode = "cached" | "live" | "disabled";';
    const response = JSON.stringify({
      values: ["cached", "live", "disabled"],
      member: "webSearchMode",
      declaration: source,
      source: citation,
    });
    const timestamp = (ordinal: number) => `2026-10-03T00:00:0${ordinal}.000Z`;
    const anchor = {
      sessionId: "cli:synthetic",
      runId: "run-synthetic",
      roomId: "native-room",
      source: "cli",
      provider: "codex",
    };
    const event = (
      ordinal: number,
      category: string,
      name: string,
      metadata: Record<string, unknown>,
    ) => ({
      ...anchor,
      category,
      event: name,
      createdAt: timestamp(ordinal),
      metadata,
    });
    const action = (
      ordinal: number,
      name: string,
      completed: boolean,
      data: Record<string, unknown> = {},
    ) =>
      event(
        ordinal,
        "action",
        completed ? "action.completed" : "action.started",
        {
          action: name,
          ...(completed
            ? {
                status: "completed",
                success: true,
                actionResult: {
                  success: true,
                  data: { actionName: name, ...data },
                },
              }
            : {}),
        },
      );
    const rows = [
      event(1, "model", "model.request", {
        path: "provider-message-service",
        prompt: "PRIVATE_PROMPT_CANARY",
      }),
      action(2, "WEB_SEARCH", false),
      action(3, "WEB_SEARCH", true, {
        query: researchGrounding.SDK_WEB_RESEARCH_QUERY,
        provider: "parallel",
        value:
          searchValue ??
          JSON.stringify({
            results: [{ url: "https://github.com/openai/codex" }],
          }),
      }),
      action(4, "WEB_FETCH", false),
      action(5, "WEB_FETCH", true, {
        url: researchGrounding.SDK_WEB_RESEARCH_SOURCE,
        value: `${source}\nexport type ThreadOptions = { webSearchMode?: WebSearchMode; };`,
      }),
      event(6, "model", "model.response", {
        path: "provider-message-service",
        response,
        runFailureMessage: null,
      }),
    ];
    const trajectories = join(dataDir, "trajectories");
    mkdirSync(trajectories, { mode: 0o755 });
    writeFileSync(
      join(trajectories, "trajectory-events.jsonl"),
      `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
      { mode: 0o644 },
    );
    const stdout = [
      { type: "start", timestamp: timestamp(0), sessionId: anchor.sessionId },
      {
        type: "result",
        timestamp: timestamp(7),
        text: response,
        shouldExit: false,
      },
      { type: "completed", timestamp: timestamp(8), status: "completed" },
    ]
      .map((row) => JSON.stringify(row))
      .join("\n");
    return { response, stdout };
  }
  afterEach(() => vi.restoreAllMocks());
  it("grades actual original retrieval before deleting state; report keeps booleans/enums only", async () => {
    const reader = vi.spyOn(researchGrounding, "readResearchGrounding");
    let data = "";
    const reportDir = tempDirectory();
    const result = await runHeadlessEvalSuite(suite, {
      reportDir,
      execute: (_command, args, options) => {
        data = options.env.DOOLITTLE_DATA_DIR ?? "";
        expect(options.env.ELIZAOS_CLOUD_ENABLED).toBe("false");
        expect(options.env.ELIZAOS_CLOUD_API_KEY).toBeUndefined();
        expect(args).toContain(suite.tasks[0].prompt);
        return { ...success, stdout: evidence(data).stdout };
      },
    });
    expect(reader).toHaveBeenCalledOnce();
    expect(result.exitCode).toBe(0);
    expect(result.report.summary.objectiveChecksPassed).toBe(5);
    expect(result.report.runs[0].humanReviewRequired).toBe(true);
    expect(result.report.schemaVersion).toBe(5);
    expect(result.report.evaluatorVersion).toBe("0.2.12");
    expect(result.report.executionOverrides).toEqual([]);
    expect(
      result.report.runs[0].diagnosticFlags.some((flag) =>
        flag.startsWith("sdk-web-citation-"),
      ),
    ).toBe(false);
    expect(existsSync(data)).toBe(false);
    expect(dirname(result.reportPath)).toBe(reportDir);
    const report = readFileSync(
      join(reportDir, basename(result.reportPath)),
      "utf8",
    );
    for (const canary of [
      "PRIVATE_PROMPT_CANARY",
      "cli:synthetic",
      "native-room",
      "run-synthetic",
      researchGrounding.SDK_WEB_RESEARCH_QUERY,
      researchGrounding.SDK_WEB_RESEARCH_SOURCE,
      "WebSearchMode =",
    ])
      expect(report).not.toContain(canary);
    expect(
      HEADLESS_EVAL_SUITES["headless-workflows-v6"].tasks.find(
        (task) => task.domain === "research",
      )?.prompt,
    ).toBe(legacyPrompt);
    expect(legacyPrompt).toMatch(/^\/research /u);
  });
  it("rejects Cloud opt-in before dispatch or creating a report directory", async () => {
    const credentials = vi
      .spyOn(accountAuth, "getLinkedElizaCloudCredentials")
      .mockImplementation(() => {
        throw new Error("Credential resolution must not occur.");
      });
    const execute = vi.fn();
    const reportDir = join(tempDirectory(), "not-created");
    await expect(
      runHeadlessEvalSuite(suite, {
        reportDir,
        enableConfiguredCloudResearch: true,
        execute,
      }),
    ).rejects.toThrow("SDK-web research cannot enable");
    expect(execute).not.toHaveBeenCalled();
    expect(credentials).not.toHaveBeenCalled();
    expect(existsSync(reportDir)).toBe(false);
  });
  it("keeps passing source agreement with an explicit opaque search-at-cap diagnostic", async () => {
    const result = await runHeadlessEvalSuite(suite, {
      reportDir: tempDirectory(),
      execute: (_command, _args, options) => ({
        ...success,
        stdout: evidence(options.env.DOOLITTLE_DATA_DIR ?? "", "x".repeat(4000))
          .stdout,
      }),
    });
    expect(result.exitCode).toBe(0);
    expect(result.report.summary.objectiveChecksPassed).toBe(5);
    expect(result.report.runs[0].checks[0].id).toBe(
      "original-search-returned-data",
    );
    expect(result.report.runs[0].diagnosticFlags).toContain(
      "sdk-web-search-output-at-cap",
    );
    expect(result.report.runs[0].diagnosticFlags).not.toContain(
      "sdk-web-grounding-retrieval-unavailable",
    );
  });
  it("does not pin or read grounding for old/default suites", async () => {
    const reader = vi.spyOn(researchGrounding, "readResearchGrounding");
    const pin = vi.spyOn(researchGrounding, "pinResearchDataRoot");
    await runHeadlessEvalSuite(HEADLESS_EVAL_SUITES["headless-workflows-v2"], {
      reportDir: tempDirectory(),
      taskIds: ["conversation-format-v2"],
      execute: () => ({
        ...success,
        stdout: JSON.stringify({ ok: true, text: '{"ready":true,"count":3}' }),
      }),
    });
    expect(pin).not.toHaveBeenCalled();
    expect(reader).not.toHaveBeenCalled();
  });
  it.each([
    ["non-string", { secret: "CITATION_SECRET_CANARY" }],
    ["whitespace", ` ${researchGrounding.SDK_WEB_RESEARCH_SOURCE} `],
    [
      "github-view",
      "https://github.com/openai/codex/blob/main/sdk/typescript/src/threadOptions.ts",
    ],
    [
      "other-url",
      "https://user:CITATION_SECRET_CANARY@foreign.invalid/private?token=CITATION_TOKEN_CANARY",
    ],
    ["non-url", "CITATION_SECRET_CANARY"],
  ] as const)(
    "persists only the fixed %s mismatch flag and keeps the original 4/5 grading",
    async (classification, citation) => {
      const reportDir = tempDirectory();
      const result = await runHeadlessEvalSuite(suite, {
        reportDir,
        execute: (_command, _args, options) => ({
          ...success,
          stdout: evidence(
            options.env.DOOLITTLE_DATA_DIR ?? "",
            undefined,
            citation,
          ).stdout,
        }),
      });
      expect(result.exitCode).toBe(1);
      expect(result.report.summary.objectiveChecksPassed).toBe(4);
      expect(
        result.report.runs[0].diagnosticFlags.filter((flag) =>
          flag.startsWith("sdk-web-citation-"),
        ),
      ).toEqual([`sdk-web-citation-${classification}`]);
      expect(result.report.runs[0].diagnosticFlags).toContain(
        "sdk-web-grounding-answer-disagreement",
      );
      expect(dirname(result.reportPath)).toBe(reportDir);
      const stored = readFileSync(
        join(reportDir, basename(result.reportPath)),
        "utf8",
      );
      for (const canary of [
        "CITATION_SECRET_CANARY",
        "CITATION_TOKEN_CANARY",
        "foreign.invalid",
        researchGrounding.SDK_WEB_RESEARCH_SOURCE,
      ])
        expect(stored).not.toContain(canary);
    },
  );
  it("a normal links-only answer cannot pass without original retrieval", async () => {
    const result = await runHeadlessEvalSuite(suite, {
      reportDir: tempDirectory(),
      execute: () => ({
        ...success,
        stdout: JSON.stringify({
          ok: true,
          text: researchGrounding.SDK_WEB_RESEARCH_SOURCE,
        }),
      }),
    });
    expect(result.report.runs[0].status).toBe("completed");
    expect(result.report.runs[0].checks.every((check) => !check.passed)).toBe(
      true,
    );
    expect(result.exitCode).toBe(1);
    expect(result.report.runs[0].diagnosticFlags).toContain(
      "sdk-web-grounding-missing-input",
    );
    expect(
      result.report.runs[0].diagnosticFlags.some((flag) =>
        flag.startsWith("sdk-web-citation-"),
      ),
    ).toBe(false);
  });
  it.each(["cancelled", "error", "exit", "no-cleanup"])(
    "never reads successful-looking evidence after %s execution",
    async (kind) => {
      const reader = vi.spyOn(researchGrounding, "readResearchGrounding");
      const reportDir = tempDirectory();
      const operation = runHeadlessEvalSuite(suite, {
        reportDir,
        execute: (_command, _args, options) => {
          const data = options.env.DOOLITTLE_DATA_DIR ?? "";
          if (kind === "no-cleanup")
            temporaryDirectories.push(dirname(dirname(data)));
          return {
            ...success,
            stdout: evidence(data).stdout,
            ...(kind === "cancelled" ? { signal: "SIGTERM" as const } : {}),
            ...(kind === "error" ? { error: new Error("ERROR_CANARY") } : {}),
            ...(kind === "exit" ? { status: 1 } : {}),
            ...(kind === "no-cleanup" ? { cleanupSafe: false } : {}),
          };
        },
      });
      if (kind === "no-cleanup") {
        await expect(operation).rejects.toThrow(
          "cleanup could not be confirmed",
        );
        expect(readdirSync(reportDir)).toEqual([]);
      } else {
        const result = await operation;
        expect(result.exitCode).toBe(1);
        expect(
          result.report.runs[0].checks.every((check) => !check.passed),
        ).toBe(true);
      }
      expect(reader).not.toHaveBeenCalled();
    },
  );
  it("refuses a substituted original task identity before grounding and preserves retained state", async () => {
    const reader = vi.spyOn(researchGrounding, "readResearchGrounding");
    const reportDir = tempDirectory();
    let replacement = "";
    await expect(
      runHeadlessEvalSuite(suite, {
        reportDir,
        execute: (_command, _args, options) => {
          const data = options.env.DOOLITTLE_DATA_DIR ?? "";
          const stdout = evidence(data).stdout;
          const task = dirname(data);
          const root = dirname(task);
          temporaryDirectories.push(root);
          renameSync(task, `${task}.original`);
          mkdirSync(task, { mode: 0o700 });
          replacement = join(task, "sentinel");
          writeFileSync(replacement, "FOREIGN_SENTINEL");
          return { ...success, stdout };
        },
      }),
    ).rejects.toThrow();
    expect(reader).not.toHaveBeenCalled();
    expect(readFileSync(replacement, "utf8")).toBe("FOREIGN_SENTINEL");
    expect(readdirSync(reportDir)).toEqual([]);
  });
});

describe("original coding verifier CLI-stream grading", () => {
  const suite = HEADLESS_EVAL_SUITES["headless-workflows-v7"];
  const task = suite.tasks.find(
    (candidate) => candidate.id === "coding-original-verifier-v1",
  );
  const passed = CODING_VERIFICATION_SUCCESS_MARKER;
  const unverified = '{"file":"math.mjs","tests":"unverified"}';
  const successfulExecution = {
    status: 0,
    stdout: "",
    stderr: "",
    signal: null,
    cleanupSafe: true,
  };
  const eventTimestamp = (second: number) =>
    `2026-10-03T00:00:${String(second).padStart(2, "0")}.000Z`;

  function receipt(overrides: Record<string, unknown> = {}) {
    return {
      type: "coding-verification",
      timestamp: eventTimestamp(2),
      verifier: CODING_VERIFICATION_ID,
      status: "verified",
      reason: "verified",
      shellStarts: 1,
      shellCompletions: 1,
      verifierMatches: 1,
      success: true,
      exitCode: 0,
      timedOut: false,
      truncated: false,
      workdirMatches: true,
      actionPairMatched: true,
      ...overrides,
    };
  }

  function stream(
    response: string,
    receipts: Array<Record<string, unknown>> = [receipt()],
    extra: Array<Record<string, unknown>> = [],
  ): string {
    if (!task) throw new Error("Missing v7 coding task.");
    return `${[
      {
        type: "start",
        timestamp: eventTimestamp(1),
        sessionId: "cli:original-coding-turn",
        command: task.prompt,
      },
      ...receipts,
      ...extra,
      {
        type: "result",
        timestamp: eventTimestamp(3),
        text: response,
        tone: "success",
        shouldExit: false,
      },
      {
        type: "completed",
        timestamp: eventTimestamp(4),
        status: "completed",
      },
    ]
      .map((event) => JSON.stringify(event))
      .join("\n")}\n`;
  }

  function writeMathModule(workspaceDir: string): void {
    writeFileSync(
      join(workspaceDir, "math.mjs"),
      "export function sumFinite(values) { return values.reduce((sum, value) => sum + (typeof value === 'number' && Number.isFinite(value) ? value : 0), 0); }\n",
      { mode: 0o600, flag: "wx" },
    );
  }

  afterEach(() => vi.restoreAllMocks());

  it("passes the v7 task only from one live top-level receipt and keeps output private", async () => {
    if (!task) throw new Error("Missing v7 coding task.");
    const reportDir = tempDirectory();
    const transientResponseCanary = "CODING_PRIVATE_RESPONSE_CANARY";
    let observedFlag: string | undefined;
    const result = await runHeadlessEvalSuite(suite, {
      reportDir,
      taskIds: [task.id],
      execute: (_command, _args, options) => {
        const dataDir = options.env.DOOLITTLE_DATA_DIR;
        if (!dataDir) throw new Error("Missing synthetic task directory.");
        observedFlag = options.env[CODING_VERIFICATION_FLAG];
        writeMathModule(join(dirname(dataDir), "workspace"));
        const stdout = stream(passed);
        // Exercise live collection across arbitrary pipe chunk boundaries.
        const bytes = Buffer.from(stdout);
        for (let offset = 0; offset < bytes.byteLength; ) {
          const end = Math.min(offset + 17, bytes.byteLength);
          options.onStdoutChunk?.(bytes.subarray(offset, end));
          offset = end;
        }
        return { ...successfulExecution, stdout };
      },
    });
    expect(observedFlag).toBe("true");
    expect(result.exitCode).toBe(0);
    expect(result.report.schemaVersion).toBe(5);
    expect(result.report.evaluatorVersion).toBe("0.2.12");
    expect(result.report.summary.objectiveChecksPassed).toBe(4);
    expect(result.report.summary.objectiveChecksTotal).toBe(4);
    expect(result.report.runs[0].checks.map((check) => check.passed)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(result.report.runs[0].diagnosticFlags).not.toContain(
      "coding-verification-verified",
    );
    const reportText = readFileSync(result.reportPath, "utf8");
    expect(CODING_VERIFICATION_SUCCESS_MARKER).toBe(
      '{"file":"math.mjs","tests":"passed"}',
    );
    for (const canary of [
      CODING_VERIFICATION_COMMAND,
      CODING_VERIFICATION_SUCCESS_MARKER,
      "cli:original-coding-turn",
      transientResponseCanary,
      passed,
    ])
      expect(reportText).not.toContain(canary);
    expect(reportText).not.toContain('"shellStarts":1');
    expect(reportText).not.toContain('"verifierMatches":1');
  });

  it("does not normalize the successful final response before grading", async () => {
    if (!task) throw new Error("Missing v7 coding task.");
    const result = await runHeadlessEvalSuite(suite, {
      reportDir: tempDirectory(),
      taskIds: [task.id],
      execute: (_command, _args, options) => {
        const dataDir = options.env.DOOLITTLE_DATA_DIR;
        if (!dataDir) throw new Error("Missing synthetic task directory.");
        writeMathModule(join(dirname(dataDir), "workspace"));
        const stdout = stream(`${passed} `);
        options.onStdoutChunk?.(Buffer.from(stdout));
        return { ...successfulExecution, stdout };
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.report.summary.objectiveChecksPassed).toBe(3);
    expect(result.report.runs[0].checks).toMatchObject([
      { passed: true },
      { passed: true },
      { passed: true },
      { passed: false },
    ]);
  });

  it.each([
    ["missing receipt", [], []],
    ["duplicate receipt", [receipt(), receipt()], []],
    ["contradictory receipt", [receipt({ timedOut: true })], []],
    [
      "nested model claim",
      [],
      [
        {
          type: "progress",
          timestamp: eventTimestamp(2),
          phase: "model",
          chunk: JSON.stringify(receipt()),
          response: JSON.stringify(receipt()),
          delta: JSON.stringify(receipt()),
        },
      ],
    ],
  ] as const)(
    "requires a top-level receipt: %s",
    async (label, receipts, extra) => {
      if (!task) throw new Error("Missing v7 coding task.");
      const reportDir = tempDirectory();
      const response = unverified;
      const result = await runHeadlessEvalSuite(suite, {
        reportDir,
        taskIds: [task.id],
        execute: (_command, _args, options) => {
          const dataDir = options.env.DOOLITTLE_DATA_DIR;
          if (!dataDir) throw new Error("Missing synthetic task directory.");
          writeMathModule(join(dirname(dataDir), "workspace"));
          const stdout = stream(response, [...receipts], [...extra]);
          options.onStdoutChunk?.(Buffer.from(stdout));
          return { ...successfulExecution, stdout };
        },
      });
      expect(result.exitCode, label).toBe(1);
      expect(result.report.summary.objectiveChecksPassed).toBe(3);
      expect(result.report.runs[0].checks).toMatchObject([
        { passed: true },
        { passed: true },
        { passed: false },
        { passed: true },
      ]);
      expect(result.report.runs[0].diagnosticFlags[0]).toMatch(
        /^coding-verification-(?:missing-input|verifier-ambiguous|invalid-input)$/u,
      );
    },
  );

  it("does not persist a passing result when child cleanup is unconfirmed", async () => {
    if (!task) throw new Error("Missing v7 coding task.");
    const reportDir = tempDirectory();
    let taskRoot = "";
    const operation = runHeadlessEvalSuite(suite, {
      reportDir,
      taskIds: [task.id],
      execute: (_command, _args, options) => {
        const dataDir = options.env.DOOLITTLE_DATA_DIR;
        if (!dataDir) throw new Error("Missing synthetic task directory.");
        taskRoot = dirname(dataDir);
        temporaryDirectories.push(dirname(taskRoot));
        writeMathModule(join(taskRoot, "workspace"));
        const stdout = stream(passed);
        options.onStdoutChunk?.(Buffer.from(stdout));
        return { ...successfulExecution, stdout, cleanupSafe: false };
      },
    });
    await expect(operation).rejects.toThrow("cleanup could not be confirmed");
    expect(existsSync(taskRoot)).toBe(true);
    expect(readdirSync(reportDir)).toEqual([]);
  });

  it("disables runtime receipt instrumentation for legacy suite tasks", async () => {
    let observedFlag: string | undefined;
    await runHeadlessEvalSuite(HEADLESS_EVAL_SUITES["headless-workflows-v6"], {
      reportDir: tempDirectory(),
      taskIds: ["reliability-no-side-effect-v6"],
      execute: (_command, _args, options) => {
        observedFlag = options.env[CODING_VERIFICATION_FLAG];
        return successfulExecution;
      },
    });
    expect(observedFlag).toBe("false");
  });
});

describe("private optional action receipt persistence", () => {
  const suite: HeadlessEvalSuite = {
    id: "action-persistence-test",
    version: 1,
    title: "Action receipt persistence",
    tasks: [
      {
        id: "one",
        domain: "conversation",
        prompt: "synthetic",
        checks: [{ id: "pass", evaluate: () => true }],
        humanReviewRequired: false,
      },
    ],
  };
  const success = {
    status: 0,
    stdout: JSON.stringify({ ok: true, text: "PRIVATE_RESPONSE_CANARY" }),
    stderr: "",
    signal: null,
    cleanupSafe: true,
  };
  it("writes default action receipts exclusively with owner-only permissions and exact report binding", async () => {
    const reportDir = tempDirectory();
    let taskRoot = "";
    const result = await runHeadlessEvalSuite(suite, {
      reportDir,
      recordActionDiagnostics: true,
      execute: (_command, _args, options) => {
        const dataDir = options.env.DOOLITTLE_DATA_DIR;
        if (!dataDir) throw new Error("Missing synthetic task directory.");
        taskRoot = dirname(dataDir);
        return success;
      },
    });
    expect(result.exitCode).toBe(0);
    expect(result.actionDiagnosticsReceiptStatus).toBe("written");
    expect(existsSync(taskRoot)).toBe(false);
    expect(dirname(result.reportPath)).toBe(reportDir);
    const ownedReportPath = join(reportDir, basename(result.reportPath));
    const reportBytes = readFileSync(ownedReportPath, "utf8");
    const actionBytes = readFileSync(`${ownedReportPath}.actions.json`, "utf8");
    expect(JSON.parse(actionBytes)).toMatchObject({
      schemaVersion: 1,
      reportSchemaVersion: 5,
      evaluatorVersion: "0.2.12",
      reportSha256: measurement.digest(reportBytes),
      mode: "opt-in-action-diagnostics",
    });
    expect(statSync(`${ownedReportPath}.actions.json`).mode & 0o777).toBe(
      0o600,
    );
    expect(actionBytes).not.toContain("PRIVATE_RESPONSE_CANARY");
    expect(actionBytes).not.toContain(taskRoot);
  });
  it.each(["collision", "symlink"])(
    "preserves a pre-existing %s action sidecar without changing grading",
    async (kind) => {
      const reportDir = tempDirectory();
      const foreign = join(tempDirectory(), "foreign-sentinel");
      writeFileSync(foreign, "PRIVATE_FOREIGN_CANARY", {
        mode: 0o600,
        flag: "wx",
      });
      const result = await runHeadlessEvalSuite(suite, {
        reportDir,
        recordActionDiagnostics: true,
        execute: () => success,
        writeMeasurementReceipt: (path) => {
          expect(dirname(path)).toBe(reportDir);
          const reportLeaf = basename(path).replace(
            /\.measurement\.json$/u,
            "",
          );
          const sidecar = join(reportDir, `${reportLeaf}.actions.json`);
          if (kind === "symlink") symlinkSync(foreign, sidecar);
          else
            writeFileSync(sidecar, "PRIVATE_EXISTING_CANARY", {
              mode: 0o600,
              flag: "wx",
            });
        },
      });
      expect(result.exitCode).toBe(0);
      expect(result.actionDiagnosticsReceiptStatus).toBe("unavailable");
      expect(dirname(result.reportPath)).toBe(reportDir);
      const sidecar = join(
        reportDir,
        `${basename(result.reportPath)}.actions.json`,
      );
      expect(readFileSync(sidecar, "utf8")).toBe(
        kind === "symlink"
          ? "PRIVATE_FOREIGN_CANARY"
          : "PRIVATE_EXISTING_CANARY",
      );
      expect(readFileSync(foreign, "utf8")).toBe("PRIVATE_FOREIGN_CANARY");
    },
  );
  it.each(["before-hook", "during-hook"])(
    "refuses report-directory replacement %s without claiming action persistence",
    async (when) => {
      const parent = tempDirectory();
      const reportDir = join(parent, "reports");
      const original = join(parent, "reports-original");
      mkdirSync(reportDir, { mode: 0o700 });
      const replace = () => {
        renameSync(reportDir, original);
        mkdirSync(reportDir, { mode: 0o700 });
        writeFileSync(
          join(reportDir, "sentinel"),
          "PRIVATE_REPLACEMENT_CANARY",
          { mode: 0o600 },
        );
      };
      const actionWriter = vi.fn((path: string) => {
        expect(dirname(path)).toBe(reportDir);
        expect(basename(path)).toMatch(/\.json\.actions\.json$/u);
        replace();
      });
      const result = await runHeadlessEvalSuite(suite, {
        reportDir,
        recordActionDiagnostics: true,
        execute: () => success,
        writeMeasurementReceipt: when === "before-hook" ? replace : undefined,
        writeActionDiagnosticsReceipt: actionWriter,
      });
      expect(actionWriter).toHaveBeenCalledTimes(
        when === "before-hook" ? 0 : 1,
      );
      expect(result.exitCode).toBe(0);
      expect(result.actionDiagnosticsReceiptStatus).toBe("unavailable");
      expect(readdirSync(reportDir)).toEqual(["sentinel"]);
      expect(readFileSync(join(reportDir, "sentinel"), "utf8")).toBe(
        "PRIVATE_REPLACEMENT_CANARY",
      );
      expect(dirname(result.reportPath)).toBe(reportDir);
      const stored = readFileSync(
        join(original, basename(result.reportPath)),
        "utf8",
      );
      expect(JSON.parse(stored).summary.completed).toBe(1);
      expect(stored).not.toContain("PRIVATE_REPLACEMENT_CANARY");
      expect(
        readdirSync(original).some((leaf) => leaf.endsWith(".actions.json")),
      ).toBe(false);
    },
  );
  it.each(["reject", "never-settling"])(
    "does not await unsupported %s action writer promises",
    async (mode) => {
      const reportDir = tempDirectory();
      const result = await runHeadlessEvalSuite(suite, {
        reportDir,
        recordActionDiagnostics: true,
        execute: () => success,
        writeActionDiagnosticsReceipt: () =>
          mode === "reject"
            ? Promise.reject(new Error("PRIVATE_WRITER_ERROR"))
            : new Promise<void>(() => undefined),
      });
      await Promise.resolve();
      expect(result.exitCode).toBe(0);
      expect(result.actionDiagnosticsReceiptStatus).toBe("unavailable");
      expect(
        readdirSync(reportDir).some((leaf) => leaf.endsWith(".actions.json")),
      ).toBe(false);
    },
  );
});

describe("headless workflow evals", () => {
  it.each(["permissions", "suite-path"])(
    "refuses unsafe report %s before child dispatch",
    async (kind) => {
      const reportDir = tempDirectory();
      const execute = vi.fn();
      if (kind === "permissions") chmodSync(reportDir, 0o755);
      const suite: HeadlessEvalSuite = {
        id: kind === "suite-path" ? "x/../../escape" : "safe-suite",
        version: 1,
        title: "Private report preflight",
        tasks: [
          {
            id: "one",
            domain: "conversation",
            prompt: "test",
            checks: [],
            humanReviewRequired: false,
          },
        ],
      };
      await expect(
        runHeadlessEvalSuite(suite, { reportDir, execute: execute as never }),
      ).rejects.toThrow();
      expect(execute).not.toHaveBeenCalled();
      expect(readdirSync(reportDir)).toEqual([]);
    },
  );
  it("does not project routes from an ordinary substituted task root or publish receipts", async () => {
    const reportDir = tempDirectory();
    const routeReader = vi.spyOn(measurement, "readRequestedRouteEvidence");
    let sentinel = "";
    const suite: HeadlessEvalSuite = {
      id: "route-identity-guard",
      version: 1,
      title: "Route guard",
      tasks: [
        {
          id: "one",
          domain: "conversation",
          prompt: "test",
          checks: [],
          humanReviewRequired: false,
        },
      ],
    };
    await expect(
      runHeadlessEvalSuite(suite, {
        reportDir,
        execute: (_command, _args, options) => {
          const dataDir = options.env.DOOLITTLE_DATA_DIR;
          if (!dataDir) throw new Error("Missing synthetic task directory.");
          const taskRoot = dirname(dataDir);
          const runRoot = dirname(taskRoot);
          expect(basename(runRoot)).toMatch(/^doolittle-headless-eval-/);
          expect(dirname(runRoot)).toBe(realpathSync(tmpdir()));
          temporaryDirectories.push(runRoot);
          renameSync(taskRoot, join(runRoot, "one-original"));
          mkdirSync(join(dataDir, "trajectories"), {
            recursive: true,
            mode: 0o700,
          });
          sentinel = join(dataDir, "trajectories", "trajectory-events.jsonl");
          writeFileSync(sentinel, "PRIVATE_FOREIGN_SENTINEL");
          return {
            status: 0,
            stdout: JSON.stringify({ ok: true, text: "answer" }),
            stderr: "",
            signal: null,
            cleanupSafe: true,
          };
        },
      }),
    ).rejects.toThrow("substituted headless directory");
    expect(routeReader).not.toHaveBeenCalled();
    expect(readFileSync(sentinel, "utf8")).toBe("PRIVATE_FOREIGN_SENTINEL");
    expect(readdirSync(reportDir)).toEqual([]);
  });
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
    expect(HEADLESS_EVAL_SUITES["headless-workflows-v5"].version).toBe(5);
    expect(HEADLESS_EVAL_SUITES["headless-workflows-v5"].tasks.length).toBe(
      HEADLESS_EVAL_SUITES["headless-workflows-v4"].tasks.length,
    );
    expect(HEADLESS_EVAL_SUITES["headless-workflows-v6"].version).toBe(6);
    expect(HEADLESS_EVAL_SUITES["headless-workflows-v6"].tasks.length).toBe(
      HEADLESS_EVAL_SUITES["headless-workflows-v5"].tasks.length,
    );
  });

  it("preserves v5 while v6 separately grades a valid numbered plan and honesty", () => {
    const v5 = HEADLESS_EVAL_SUITES["headless-workflows-v5"].tasks.find(
      (task) => task.id === "reliability-no-side-effect-v5",
    );
    const v6 = HEADLESS_EVAL_SUITES["headless-workflows-v6"].tasks.find(
      (task) => task.id === "reliability-no-side-effect-v6",
    );
    const input = {
      response:
        "1. Agree on status sections.\n2. Create the file in a later authorized change.\n\nThe file was not created.",
      responses: [],
      workspaceDir: "unused",
      actionStarts: 0,
    };
    expect(v6?.prompt).toBe(v5?.prompt);
    expect(
      v5?.checks
        .find((check) => check.id === "honestly-reports-no-change")
        ?.evaluate(input),
    ).toBe(false);
    expect(
      v6?.checks
        .find((check) => check.id === "honestly-reports-no-change")
        ?.evaluate(input),
    ).toBe(true);
    expect(
      v6?.checks
        .find((check) => check.id === "proposes-two-step-plan")
        ?.evaluate(input),
    ).toBe(true);
  });

  it.each([
    ["Step 1: Draft the outline.\nStep 2: Review it.", true],
    ["**1.** Draft the outline.\n**2.** Review it.", true],
    ["- Draft the outline.\n- Review it.", true],
    ["1. Draft the outline.", false],
    ["1. Draft it.\n2. Review it.\n3. Publish it.", false],
    ["2. Draft the outline.\n1. Review it.", false],
    ["- Draft the outline.\n- Review it.\n- Publish it.", false],
    ["On it. The file was not created.", false],
  ])(
    "v6 structurally grades the two-step proposal %s",
    (response, expected) => {
      const task = HEADLESS_EVAL_SUITES["headless-workflows-v6"].tasks.find(
        (candidate) => candidate.id === "reliability-no-side-effect-v6",
      );
      expect(
        task?.checks
          .find((check) => check.id === "proposes-two-step-plan")
          ?.evaluate({
            response: String(response),
            responses: [],
            workspaceDir: "unused",
            actionStarts: 0,
          }),
      ).toBe(expected);
    },
  );

  it("does not let a plan replace the no-change statement or the zero-action check", () => {
    const task = HEADLESS_EVAL_SUITES["headless-workflows-v6"].tasks.find(
      (candidate) => candidate.id === "reliability-no-side-effect-v6",
    );
    const input = {
      response: "1. Draft the outline.\n2. Review it.",
      responses: [],
      workspaceDir: "unused",
      actionStarts: 1,
    };
    expect(
      task?.checks
        .find((check) => check.id === "honestly-reports-no-change")
        ?.evaluate(input),
    ).toBe(false);
    expect(
      task?.checks
        .find((check) => check.id === "no-agent-action-started")
        ?.evaluate(input),
    ).toBe(false);
    expect(
      task?.checks
        .find((check) => check.id === "no-agent-action-started")
        ?.evaluate({ ...input, actionStarts: null }),
    ).toBe(false);
  });

  it("grades no-side-effect action use from telemetry in v5 only", () => {
    const findCheck = (suiteId: string) => {
      const task = HEADLESS_EVAL_SUITES[suiteId].tasks.find((candidate) =>
        candidate.id.startsWith("reliability-no-side-effect-"),
      );
      return task?.checks.find(
        (check) => check.id === "no-agent-action-started",
      );
    };
    const context = {
      response: "The file was not created. Step 1: plan the change.",
      responses: [],
      workspaceDir: tempDirectory(),
      actionStarts: 0,
    };
    const v4Check = findCheck("headless-workflows-v4");
    const v5Check = findCheck("headless-workflows-v5");

    expect(v4Check).toBeUndefined();
    expect(v5Check).toBeDefined();
    expect(v5Check?.evaluate(context)).toBe(true);
    expect(v5Check?.evaluate({ ...context, actionStarts: 1 })).toBe(false);
    expect(v5Check?.evaluate({ ...context, actionStarts: null })).toBe(false);
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
    const context = {
      response: "",
      responses: [],
      workspaceDir,
      actionStarts: 0,
    };
    expect(check?.evaluate(context)).toBe(true);

    writeFileSync(join(workspaceDir, "notes.txt"), "unexpected task file\n");
    expect(check?.evaluate(context)).toBe(false);
  });

  it("saves owner-only reports without prompts or raw responses", async () => {
    const response = "a private model answer";
    const reportDir = tempDirectory();
    let childArguments: readonly string[] | string | undefined;
    let childEnvironment: NodeJS.ProcessEnv | undefined;
    const actionLabelDiagnostics: Array<{
      taskId: string;
      labels: string[];
      omitted: number;
    }> = [];
    let monotonicClock = 0;
    let wallClock = 1_000;
    const execute = vi.fn(
      (
        _command: string,
        args: readonly string[] | string,
        options?: {
          env?: NodeJS.ProcessEnv;
          onStdoutChunk?: (chunk: Buffer) => void;
        },
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
                createdAt: new Date(1_008).toISOString(),
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
              {
                category: "action",
                event: "action.started",
                metadata: {
                  action: "DOOLITTLE_RESEARCH",
                  arguments: "PRIVATE_ACTION_ARGUMENT",
                  workspacePath: "/private/workspace/path",
                },
              },
              {
                category: "action",
                event: "action.completed",
                metadata: {
                  action: "DOOLITTLE_RESEARCH",
                  success: true,
                  actionResult: { text: "PRIVATE_ACTION_OUTPUT" },
                },
              },
              {
                category: "action",
                event: "action.started",
                metadata: { action: "private generated label with details" },
              },
              {
                category: "action",
                event: "action.completed",
                metadata: {
                  action: "private generated label with details",
                  success: false,
                  actionResult: { error: "PRIVATE_ACTION_ERROR" },
                },
              },
              {
                category: "action",
                event: "action.completed",
                metadata: { action: "PRIVATE_UNKNOWN_ACTION" },
              },
            ]
              .map((event) => JSON.stringify(event))
              .join("\n"),
          );
        }
        wallClock = 1_017;
        monotonicClock = 17;
        options?.onStdoutChunk?.(
          Buffer.from(
            `${JSON.stringify({
              type: "progress",
              phase: "model",
              delta: response,
            })}\n`,
          ),
        );
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
          cleanupSafe: true,
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
            {
              id: "action-starts-visible-to-grader",
              evaluate: ({ actionStarts }) => actionStarts === 2,
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
      wallNow: () => wallClock,
      monotonicNow: () => monotonicClock,
      onActionLabels: (taskId, diagnostic) =>
        actionLabelDiagnostics.push({ taskId, ...diagnostic }),
    });

    const stored = readFileSync(result.reportPath, "utf8");
    expect(result.exitCode).toBe(0);
    expect(childArguments).toContain("--json-stream");
    expect(actionLabelDiagnostics).toEqual([
      {
        taskId: "one-shot",
        labels: ["DOOLITTLE_RESEARCH", "[redacted]"],
        omitted: 0,
      },
    ]);
    expect(stored).not.toContain("this prompt must not be persisted");
    expect(stored).not.toContain(response);
    expect(result.report.runs[0]).toMatchObject({
      status: "completed",
      checks: [
        { id: "returned", passed: true },
        { id: "action-starts-visible-to-grader", passed: true },
      ],
      humanReviewRequired: true,
    });
    expect(result.report.schemaVersion).toBe(5);
    expect(result.report.source.revision).toMatch(/^[a-f0-9]{40}$/i);
    expect(result.report.runs[0]?.traceSummary).toEqual({
      journalAvailable: true,
      malformed: false,
      modelRequests: 1,
      modelResponses: 1,
      modelErrors: 0,
      mutationContinuations: 1,
      actionStarts: 2,
      actionCompletions: 3,
      actionSuccesses: 1,
      actionFailures: 1,
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
    expect(childEnvironment?.DOOLITTLE_GATEWAY_DATA_DIR).toBe(
      join(dirname(childEnvironment?.DOOLITTLE_DATA_DIR as string), "gateway"),
    );
    expect(childEnvironment?.DOOLITTLE_HOOKS_DIR).toBe(
      join(dirname(childEnvironment?.DOOLITTLE_DATA_DIR as string), "hooks"),
    );
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
    expect(stored).not.toContain("DOOLITTLE_RESEARCH");
    expect(stored).not.toContain("private generated label with details");
    expect(stored).not.toContain("PRIVATE_UNKNOWN_ACTION");
    expect(stored).not.toContain("PRIVATE_ACTION_ARGUMENT");
    expect(stored).not.toContain("/private/workspace/path");
    expect(stored).not.toContain("PRIVATE_ACTION_OUTPUT");
    expect(stored).not.toContain("PRIVATE_ACTION_ERROR");
    expect(result.report.runs[0]?.timing).toEqual({
      taskSetupMs: expect.any(Number),
      execDurationMs: expect.any(Number),
      execToFirstModelRequestMs: 8,
      execToFirstAssistantTextMs: 17,
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
        cleanupSafe: true,
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
          cleanupSafe: true,
        };
      }) as never,
    });

    expect(result.report.runs[0]?.timing).toEqual({
      taskSetupMs: 0,
      execDurationMs: 125,
      execToFirstModelRequestMs: null,
      execToFirstAssistantTextMs: null,
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

  it("excludes per-task filesystem cleanup from suite wall time", async () => {
    const reportDir = tempDirectory();
    let clockCall = 0;
    const clockValues = [0, 0, 0, 0, 0, 10, 10, 10, 20, 20, 120, 120];
    const suite: HeadlessEvalSuite = {
      id: "cleanup-timing",
      version: 1,
      title: "Cleanup timing",
      tasks: [
        {
          id: "one-task",
          domain: "conversation",
          prompt: "prompt",
          checks: [{ id: "pass", evaluate: () => true }],
          humanReviewRequired: false,
        },
      ],
    };

    const result = await runHeadlessEvalSuite(suite, {
      reportDir,
      monotonicNow: () => clockValues[clockCall++] ?? 120,
      execute: (() => ({
        status: 0,
        stdout: `${JSON.stringify({ ok: true, text: "answer" })}\n`,
        stderr: "",
        error: undefined,
        signal: null,
        cleanupSafe: true,
      })) as never,
    });

    expect(clockCall).toBe(20);
    expect(result.report.runs[0]?.harnessTiming.cleanupMs).toBe(100);
    expect(result.report.summary.suiteWallTimeMs).toBe(20);
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
          cleanupSafe: true,
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

  it("removes each task root after its callbacks and grading, before the next task", async () => {
    const reportDir = tempDirectory();
    const observations: string[] = [];
    let priorDataDir: string | undefined;
    const suite: HeadlessEvalSuite = {
      id: "task-cleanup-order",
      version: 1,
      title: "Task cleanup order",
      tasks: ["first", "second"].map((id) => ({
        id,
        domain: "conversation" as const,
        prompt: id,
        checks: [
          {
            id: "grader-ran",
            evaluate: () => {
              observations.push(`${id}:graded`);
              return true;
            },
          },
        ],
        humanReviewRequired: false,
      })),
    };
    const result = await runHeadlessEvalSuite(suite, {
      reportDir,
      showResponses: true,
      onResponse: (id) => observations.push(`${id}:response`),
      onActionLabels: (id) => observations.push(`${id}:labels`),
      execute: ((
        _command: string,
        _args: readonly string[] | string,
        options?: { env?: NodeJS.ProcessEnv },
      ) => {
        const dataDir = options?.env?.DOOLITTLE_DATA_DIR as string;
        if (priorDataDir) {
          const prior = priorDataDir;
          expect(() => statSync(prior)).toThrow();
        }
        priorDataDir = dataDir;
        mkdirSync(join(dataDir, "trajectories"), { recursive: true });
        writeFileSync(
          join(dataDir, "trajectories", "trajectory-events.jsonl"),
          "{}\n",
        );
        return {
          status: 0,
          stdout: `${JSON.stringify({ ok: true, text: "answer" })}\n`,
          stderr: "",
          error: undefined,
          signal: null,
          cleanupSafe: true,
        };
      }) as never,
    });

    expect(observations).toEqual([
      "first:response",
      "first:labels",
      "first:graded",
      "second:response",
      "second:labels",
      "second:graded",
    ]);
    expect(() => statSync(priorDataDir as string)).toThrow();
    expect(result.report.runs).toHaveLength(2);
  });

  it("keeps task state through all follow-up executions and cleans a failed task", async () => {
    const reportDir = tempDirectory();
    const seenDirectories: string[] = [];
    const suite: HeadlessEvalSuite = {
      id: "task-cleanup-followups",
      version: 1,
      title: "Task cleanup follow-ups",
      tasks: [
        {
          id: "failed-multi-turn",
          domain: "conversation",
          prompt: "first",
          followUpPrompts: ["second"],
          checks: [{ id: "always", evaluate: () => true }],
          humanReviewRequired: false,
        },
      ],
    };
    const result = await runHeadlessEvalSuite(suite, {
      reportDir,
      execute: ((
        _command: string,
        _args: readonly string[] | string,
        options?: { env?: NodeJS.ProcessEnv },
      ) => {
        const dataDir = options?.env?.DOOLITTLE_DATA_DIR as string;
        seenDirectories.push(dataDir);
        if (seenDirectories.length === 1) {
          writeFileSync(join(dataDir, "same-task-state"), "retained");
          return {
            status: 0,
            stdout: `${JSON.stringify({ ok: true, text: "continue" })}\n`,
            stderr: "",
            error: undefined,
            signal: null,
            cleanupSafe: true,
          };
        }
        expect(readFileSync(join(dataDir, "same-task-state"), "utf8")).toBe(
          "retained",
        );
        return {
          status: 1,
          stdout: `${JSON.stringify({ ok: false, text: "failed" })}\n`,
          stderr: "",
          error: undefined,
          signal: null,
          cleanupSafe: true,
        };
      }) as never,
    });

    expect(seenDirectories[0]).toBe(seenDirectories[1]);
    expect(result.report.runs[0]).toMatchObject({ status: "failed" });
    expect(() => statSync(seenDirectories[0] as string)).toThrow();
  });

  it.each(["ETIMEDOUT", "ERR_CHILD_PROCESS_STDIO_MAXBUFFER", "signal:SIGTERM"])(
    "fails and cleans a safe zero-exit child with valid final JSON but executor failure %s",
    async (errorCode) => {
      const reportDir = tempDirectory();
      let taskRoot = "";
      const suite: HeadlessEvalSuite = {
        id: "zero-exit-executor-failure",
        version: 1,
        title: "Zero-exit executor failure",
        tasks: [
          {
            id: "one",
            domain: "conversation",
            prompt: "first",
            followUpPrompts: ["must-not-run"],
            checks: [],
            humanReviewRequired: false,
          },
        ],
      };
      const execute = vi.fn((_command, _args, options) => {
        taskRoot = dirname(options.env.DOOLITTLE_DATA_DIR);
        writeFileSync(join(taskRoot, "owned-state"), "retained until grading");
        return {
          status: 0,
          stdout: JSON.stringify({ ok: true, text: "answer" }),
          stderr: "",
          error: errorCode.startsWith("signal:")
            ? undefined
            : Object.assign(new Error("Executor failed."), { code: errorCode }),
          signal: errorCode.startsWith("signal:") ? "SIGTERM" : null,
          cleanupSafe: true,
        };
      });
      const result = await runHeadlessEvalSuite(suite, {
        reportDir,
        execute: execute as never,
      });
      expect(execute).toHaveBeenCalledTimes(1);
      expect(result.exitCode).toBe(1);
      expect(result.report.runs[0]).toMatchObject({
        status: "failed",
        errorCode,
        timing: { execInvocations: 1 },
        responseSha256s: [expect.any(String)],
      });
      expect(() => statSync(taskRoot)).toThrow();
      expect(() => statSync(dirname(taskRoot))).toThrow();
      expect(dirname(result.reportPath)).toBe(reportDir);
      const ownedReportPath = join(reportDir, basename(result.reportPath));
      expect(
        JSON.parse(readFileSync(ownedReportPath, "utf8")).runs[0],
      ).toMatchObject({
        status: "failed",
        errorCode,
      });
    },
  );

  it.each(["../outside", ".", "", "/tmp/escape"])(
    "rejects unsafe task ID %s before creating task files",
    async (taskId) => {
      const reportDir = tempDirectory();
      const execute = vi.fn();
      const suite: HeadlessEvalSuite = {
        id: "invalid-task-id",
        version: 1,
        title: "Invalid task ID",
        tasks: [
          {
            id: taskId,
            domain: "conversation",
            prompt: "prompt",
            checks: [],
            humanReviewRequired: false,
          },
        ],
      };

      await expect(
        runHeadlessEvalSuite(suite, { reportDir, execute: execute as never }),
      ).rejects.toThrow("safe path components");
      expect(execute).not.toHaveBeenCalled();
      expect(readdirSync(reportDir)).toEqual([]);
    },
  );

  it.each([false, undefined])(
    "retains unsafe task/run state and starts no follow-up or next task: cleanupSafe=%s",
    async (cleanupSafe) => {
      const routeReader = vi.spyOn(measurement, "readRequestedRouteEvidence");
      const reportDir = tempDirectory();
      const observations: string[] = [];
      let dataDir = "";
      const suite: HeadlessEvalSuite = {
        id: "unsafe-cleanup",
        version: 1,
        title: "Unsafe cleanup",
        tasks: ["first", "second"].map((id) => ({
          id,
          domain: "conversation" as const,
          prompt: id,
          followUpPrompts: ["follow-up"],
          checks: [
            {
              id: "observed",
              evaluate: () => {
                observations.push("graded");
                return true;
              },
            },
          ],
          humanReviewRequired: false,
        })),
      };
      const execute = vi.fn((_command, _args, options) => {
        dataDir = options.env.DOOLITTLE_DATA_DIR;
        temporaryDirectories.push(dirname(dirname(dataDir)));
        writeFileSync(join(dataDir, "retained-state"), "retained");
        return {
          status: 0,
          stdout: JSON.stringify({ ok: true, text: "answer" }),
          stderr: "",
          signal: null,
          cleanupSafe,
        };
      });
      await expect(
        runHeadlessEvalSuite(suite, {
          reportDir,
          execute: execute as never,
          showResponses: true,
          onResponse: () => observations.push("response"),
          onActionLabels: () => observations.push("labels"),
        }),
      ).rejects.toThrow("cleanup could not be confirmed");
      expect(execute).toHaveBeenCalledTimes(1);
      expect(routeReader).not.toHaveBeenCalled();
      expect(observations).toEqual(["response", "labels", "graded"]);
      expect(readFileSync(join(dataDir, "retained-state"), "utf8")).toBe(
        "retained",
      );
      expect(readdirSync(reportDir)).toEqual([]);
    },
  );

  it.each(["task", "run", "symlink", "missing"])(
    "refuses a substituted %s directory and preserves replacement sentinels through finally",
    async (target) => {
      const reportDir = tempDirectory();
      const foreign = tempDirectory();
      let replacement = "";
      let moved = "";
      const suite: HeadlessEvalSuite = {
        id: "substitution-cleanup",
        version: 1,
        title: "Substitution cleanup",
        tasks: [
          {
            id: "one",
            domain: "conversation",
            prompt: "first",
            followUpPrompts: ["must-not-run"],
            checks: [],
            humanReviewRequired: false,
          },
        ],
      };
      const execute = vi.fn((_command, _args, options) => {
        const taskRoot = dirname(options.env.DOOLITTLE_DATA_DIR);
        const runRoot = dirname(taskRoot);
        temporaryDirectories.push(runRoot);
        replacement = target === "run" ? runRoot : taskRoot;
        moved = `${replacement}.original`;
        writeFileSync(join(replacement, "foreign-sentinel"), "foreign");
        renameSync(replacement, moved);
        if (target === "run") temporaryDirectories.push(moved);
        if (target === "symlink") symlinkSync(foreign, replacement, "dir");
        else if (target !== "missing") mkdirSync(replacement);
        if (target !== "missing")
          writeFileSync(join(replacement, "foreign-sentinel"), "foreign");
        return {
          status: 0,
          stdout: JSON.stringify({ ok: true, text: "answer" }),
          stderr: "",
          signal: null,
          cleanupSafe: true,
        };
      });
      let failure: unknown;
      try {
        await runHeadlessEvalSuite(suite, {
          reportDir,
          execute: execute as never,
        });
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toMatch(
        /substituted|ordinary directory/,
      );
      expect((failure as Error).message).not.toContain(replacement);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(
        readFileSync(
          join(target === "missing" ? moved : replacement, "foreign-sentinel"),
          "utf8",
        ),
      ).toBe("foreign");
      expect(statSync(moved).isDirectory()).toBe(true);
      expect(readdirSync(reportDir)).toEqual([]);
    },
  );

  it("does not delete a task replacement introduced during grading after a safe execution", async () => {
    const reportDir = tempDirectory();
    let taskRoot = "";
    const suite: HeadlessEvalSuite = {
      id: "grading-substitution",
      version: 1,
      title: "Grading substitution",
      tasks: [
        {
          id: "one",
          domain: "conversation",
          prompt: "first",
          checks: [
            {
              id: "replace",
              evaluate: () => {
                renameSync(taskRoot, `${taskRoot}.original`);
                mkdirSync(taskRoot);
                writeFileSync(join(taskRoot, "foreign-sentinel"), "foreign");
                return true;
              },
            },
          ],
          humanReviewRequired: false,
        },
      ],
    };
    const execute = (
      _command: string,
      _args: string[],
      options: { env: NodeJS.ProcessEnv },
    ) => {
      taskRoot = dirname(options.env.DOOLITTLE_DATA_DIR as string);
      temporaryDirectories.push(dirname(taskRoot));
      return {
        status: 0,
        stdout: JSON.stringify({ ok: true, text: "answer" }),
        stderr: "",
        signal: null,
        cleanupSafe: true,
      };
    };
    await expect(
      runHeadlessEvalSuite(suite, { reportDir, execute }),
    ).rejects.toThrow("substituted headless directory");
    expect(readFileSync(join(taskRoot, "foreign-sentinel"), "utf8")).toBe(
      "foreign",
    );
    expect(statSync(`${taskRoot}.original`).isDirectory()).toBe(true);
    expect(readdirSync(reportDir)).toEqual([]);
  });

  it("refuses a final run-root replacement before persisting a report", async () => {
    const reportDir = tempDirectory();
    let runRoot = "";
    const suite: HeadlessEvalSuite = {
      id: "final-substitution",
      version: 1,
      title: "Final substitution",
      tasks: [
        {
          id: "one",
          domain: "conversation",
          prompt: "first",
          checks: [],
          humanReviewRequired: false,
        },
      ],
    };
    const execute = (
      _command: string,
      _args: string[],
      options: { env: NodeJS.ProcessEnv },
    ) => {
      runRoot = dirname(dirname(options.env.DOOLITTLE_DATA_DIR as string));
      temporaryDirectories.push(runRoot);
      return {
        status: 0,
        stdout: JSON.stringify({ ok: true, text: "answer" }),
        stderr: "",
        signal: null,
        cleanupSafe: true,
      };
    };
    await expect(
      runHeadlessEvalSuite(suite, {
        reportDir,
        execute,
        now: () => {
          renameSync(runRoot, `${runRoot}.original`);
          temporaryDirectories.push(`${runRoot}.original`);
          mkdirSync(runRoot);
          writeFileSync(join(runRoot, "foreign-sentinel"), "foreign");
          return new Date();
        },
      }),
    ).rejects.toThrow("substituted headless directory");
    expect(readFileSync(join(runRoot, "foreign-sentinel"), "utf8")).toBe(
      "foreign",
    );
    expect(statSync(`${runRoot}.original`).isDirectory()).toBe(true);
    expect(readdirSync(reportDir)).toEqual([]);
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
          cleanupSafe: true,
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

  it("passes stored Eliza Cloud credentials only to opted-in research tasks", async () => {
    const reportDir = tempDirectory();
    const profileDir = tempDirectory();
    mkdirSync(join(profileDir, "auth"), { recursive: true });
    writeFileSync(
      join(profileDir, "auth", "providers.json"),
      JSON.stringify({
        version: 1,
        providers: {
          elizacloud: {
            apiKey: "stored-cloud-test-key",
            baseUrl: "https://cloud.example.test",
            authMode: "api-key",
          },
        },
      }),
    );
    const environments: NodeJS.ProcessEnv[] = [];
    const environmentKeys = [
      "DOOLITTLE_DATA_DIR",
      "DOOLITTLE_DATA_PATH",
      "ELIZAOS_CLOUD_ENABLED",
      "ELIZAOS_CLOUD_API_KEY",
      "ELIZA_CLOUD_API_KEY",
      "ELIZAOS_CLOUD_BASE_URL",
    ];
    const previousEnvironment = new Map(
      environmentKeys.map((key) => [key, process.env[key]]),
    );
    process.env.DOOLITTLE_DATA_DIR = profileDir;
    delete process.env.DOOLITTLE_DATA_PATH;
    process.env.ELIZAOS_CLOUD_ENABLED = "true";
    delete process.env.ELIZAOS_CLOUD_API_KEY;
    delete process.env.ELIZA_CLOUD_API_KEY;
    delete process.env.ELIZAOS_CLOUD_BASE_URL;
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
          cleanupSafe: true,
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
      for (const [key, value] of previousEnvironment) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }

    expect(environments[0]?.ELIZAOS_CLOUD_ENABLED).toBe("false");
    expect(environments[1]?.ELIZAOS_CLOUD_ENABLED).toBe("true");
    expect(environments[0]?.ELIZAOS_CLOUD_API_KEY).toBeUndefined();
    expect(environments[0]?.ELIZA_CLOUD_API_KEY).toBeUndefined();
    expect(environments[1]?.ELIZAOS_CLOUD_API_KEY).toBe(
      "stored-cloud-test-key",
    );
    expect(environments[1]?.ELIZA_CLOUD_API_KEY).toBeUndefined();
    expect(environments[1]?.ELIZAOS_CLOUD_BASE_URL).toBe(
      "https://cloud.example.test/api/v1",
    );
    expect(readFileSync(result.reportPath, "utf8")).not.toContain(
      "stored-cloud-test-key",
    );
    expect(result.report.executionOverrides).toEqual([
      "Eliza Cloud was enabled only for opted-in research tasks; its API key was supplied through that child process environment and never written to reports.",
    ]);
  });

  it("prefers a current environment key over the stored Eliza Cloud key", async () => {
    const reportDir = tempDirectory();
    const profileDir = tempDirectory();
    mkdirSync(join(profileDir, "auth"), { recursive: true });
    writeFileSync(
      join(profileDir, "auth", "providers.json"),
      JSON.stringify({
        version: 1,
        providers: { elizacloud: { apiKey: "stored-cloud-test-key" } },
      }),
    );
    const environmentKeys = [
      "DOOLITTLE_DATA_DIR",
      "DOOLITTLE_DATA_PATH",
      "ELIZAOS_CLOUD_API_KEY",
      "ELIZA_CLOUD_API_KEY",
    ];
    const previousEnvironment = new Map(
      environmentKeys.map((key) => [key, process.env[key]]),
    );
    process.env.DOOLITTLE_DATA_DIR = profileDir;
    delete process.env.DOOLITTLE_DATA_PATH;
    process.env.ELIZAOS_CLOUD_API_KEY = "current-cloud-test-key";
    process.env.ELIZA_CLOUD_API_KEY = "legacy-cloud-test-key";
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
          cleanupSafe: true,
        };
      },
    ) as never;
    const suite: HeadlessEvalSuite = {
      id: "research-key-precedence",
      version: 1,
      title: "Research key precedence",
      tasks: [
        {
          id: "research",
          domain: "research",
          prompt: "private research prompt",
          checks: [{ id: "result", evaluate: () => true }],
          humanReviewRequired: true,
        },
      ],
    };

    try {
      await runHeadlessEvalSuite(suite, {
        reportDir,
        execute,
        enableConfiguredCloudResearch: true,
      });
    } finally {
      for (const [key, value] of previousEnvironment) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }

    expect(childEnvironment?.ELIZAOS_CLOUD_API_KEY).toBe(
      "current-cloud-test-key",
    );
    expect(childEnvironment?.ELIZA_CLOUD_API_KEY).toBeUndefined();
  });

  it("strips inherited Eliza Cloud keys when research is not opted in", async () => {
    const reportDir = tempDirectory();
    const environmentKeys = [
      "ELIZAOS_CLOUD_ENABLED",
      "ELIZAOS_CLOUD_API_KEY",
      "ELIZA_CLOUD_API_KEY",
    ];
    const previousEnvironment = new Map(
      environmentKeys.map((key) => [key, process.env[key]]),
    );
    process.env.ELIZAOS_CLOUD_ENABLED = "true";
    process.env.ELIZAOS_CLOUD_API_KEY = "ambient-cloud-test-key";
    process.env.ELIZA_CLOUD_API_KEY = "ambient-legacy-cloud-test-key";
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
          stdout: `${JSON.stringify({ ok: true, text: "Conversation complete." })}\n`,
          stderr: "",
          error: undefined,
          signal: null,
          cleanupSafe: true,
        };
      },
    ) as never;
    const suite: HeadlessEvalSuite = {
      id: "conversation-key-isolation",
      version: 1,
      title: "Conversation key isolation",
      tasks: [
        {
          id: "conversation",
          domain: "conversation",
          prompt: "private conversation prompt",
          checks: [{ id: "result", evaluate: () => true }],
          humanReviewRequired: true,
        },
      ],
    };

    try {
      await runHeadlessEvalSuite(suite, { reportDir, execute });
    } finally {
      for (const [key, value] of previousEnvironment) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }

    expect(childEnvironment?.ELIZAOS_CLOUD_ENABLED).toBe("false");
    expect(childEnvironment?.ELIZAOS_CLOUD_API_KEY).toBeUndefined();
    expect(childEnvironment?.ELIZA_CLOUD_API_KEY).toBeUndefined();
  });

  it("reports missing configured credentials without enabling Eliza Cloud", async () => {
    const reportDir = tempDirectory();
    const profileDir = tempDirectory();
    const environmentKeys = [
      "DOOLITTLE_DATA_DIR",
      "DOOLITTLE_DATA_PATH",
      "ELIZAOS_CLOUD_ENABLED",
      "ELIZAOS_CLOUD_API_KEY",
      "ELIZA_CLOUD_API_KEY",
    ];
    const previousEnvironment = new Map(
      environmentKeys.map((key) => [key, process.env[key]]),
    );
    process.env.DOOLITTLE_DATA_DIR = profileDir;
    delete process.env.DOOLITTLE_DATA_PATH;
    delete process.env.ELIZAOS_CLOUD_ENABLED;
    delete process.env.ELIZAOS_CLOUD_API_KEY;
    delete process.env.ELIZA_CLOUD_API_KEY;
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
          cleanupSafe: true,
        };
      },
    ) as never;
    const suite: HeadlessEvalSuite = {
      id: "research-credentials-missing",
      version: 1,
      title: "Research credentials missing",
      tasks: [
        {
          id: "research",
          domain: "research",
          prompt: "private research prompt",
          checks: [{ id: "result", evaluate: () => true }],
          humanReviewRequired: true,
        },
      ],
    };
    let result: Awaited<ReturnType<typeof runHeadlessEvalSuite>>;

    try {
      result = await runHeadlessEvalSuite(suite, {
        reportDir,
        execute,
        enableConfiguredCloudResearch: true,
      });
    } finally {
      for (const [key, value] of previousEnvironment) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }

    expect(childEnvironment?.ELIZAOS_CLOUD_ENABLED).toBe("false");
    expect(result.report.runs[0]?.diagnosticFlags).toContain(
      "research-provider-credentials-unavailable",
    );
    expect(result.report.executionOverrides).toEqual([
      "Eliza Cloud research was opted in, but no configured API key was available; no key was passed to any task process.",
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
          cleanupSafe: true,
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
      cleanupSafe: true,
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
          cleanupSafe: true,
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
