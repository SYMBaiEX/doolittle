import {
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
import { afterEach, describe, expect, it, vi } from "vitest";
import * as outcomesModule from "./action-outcomes";
import {
  ACTION_DIAGNOSTIC_BYTE_LIMIT,
  ACTION_DIAGNOSTIC_EVENT_LIMIT,
  readActionOutcomes,
} from "./action-outcomes";
import { digest } from "./measurement";
import { runHeadlessEvalSuite } from "./runner";

const roots: string[] = [];
const canary = "PRIVATE_LABEL_ARGUMENT_RESULT_ERROR_ID_COMMAND_URL_SECRET";
function root(): string {
  const dir = realpathSync(
    mkdtempSync(join(tmpdir(), "headless-action-outcomes-test-")),
  );
  roots.push(dir);
  return dir;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of roots.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function journalPath(dir: string): string {
  mkdirSync(join(dir, "trajectories"), { recursive: true });
  return join(dir, "trajectories", "trajectory-events.jsonl");
}
function journal(dir: string, events: unknown[]): void {
  writeFileSync(
    journalPath(dir),
    events.map((event) => JSON.stringify(event)).join("\n"),
  );
}
function event(action: unknown, success?: unknown, name = "action.completed") {
  return {
    category: "action",
    event: name,
    runId: canary,
    roomId: canary,
    text: canary,
    metadata: {
      action,
      success,
      status: canary,
      actionResult: canary,
      args: canary,
      command: canary,
      url: canary,
    },
  };
}
const suite = {
  id: "actions-test",
  version: 1,
  title: "Actions",
  tasks: [
    {
      id: "one",
      domain: "conversation" as const,
      prompt: "Synthetic",
      checks: [{ id: "pass", evaluate: () => true }],
      humanReviewRequired: true,
    },
  ],
};
const success = {
  status: 0,
  stdout: JSON.stringify({ ok: true, text: "Synthetic success" }),
  stderr: "",
  signal: null,
  cleanupSafe: true,
};
describe("content-free opt-in action diagnostics", () => {
  it("maps exact source-backed names only and excludes every raw content field", () => {
    const dir = root();
    journal(dir, [
      event("READ_FILE", undefined, "action.started"),
      event("READ_FILE", true),
      event("SHELL", false),
      event("DOOLITTLE_CODING", true),
      event("TASKS_SPAWN_AGENT", false),
      event(canary, false),
      event("READ_FILE ", true),
      event("__proto__", true),
      event(`DOOLITTLE_SECRET_${canary}`, undefined),
    ]);
    const result = readActionOutcomes(dir);
    expect(result).toMatchObject({
      status: "complete",
      acceptedEvents: 9,
      provenance: "doolittle-action-journal",
      duplicatePolicy: "count-each-record",
    });
    expect(result.categories.files).toEqual({
      started: 1,
      completed: 1,
      success: 1,
      failure: 0,
      unknown: 0,
    });
    expect(result.categories.shell.failure).toBe(1);
    expect(result.categories.delegation.failure).toBe(1);
    expect(result.categories.other).toEqual({
      started: 0,
      completed: 4,
      success: 2,
      failure: 1,
      unknown: 1,
    });
    for (const value of [
      canary,
      "READ_FILE",
      "SHELL",
      "TASKS_SPAWN_AGENT",
      "__proto__",
    ])
      expect(JSON.stringify(result)).not.toContain(value);
  });
  it("counts duplicate records, not distinct actions, and keeps untyped success unknown", () => {
    const dir = root();
    const duplicate = event("DOOLITTLE_WORKSPACE", false);
    journal(dir, [
      duplicate,
      duplicate,
      event("DOOLITTLE_WORKSPACE", "false"),
      event(undefined),
      event("READ_FILE", null),
    ]);
    const result = readActionOutcomes(dir);
    expect(result.categories.workspace).toEqual({
      started: 0,
      completed: 3,
      success: 0,
      failure: 2,
      unknown: 1,
    });
    expect(result.categories.other.unknown).toBe(1);
    expect(result.categories.files.unknown).toBe(1);
  });
  it("rejects malformed records, ignores non-action categories and preserves partial coverage", () => {
    const dir = root();
    writeFileSync(
      journalPath(dir),
      `not-json\nnull\n[]\n${JSON.stringify({ category: "model", event: "model.request", text: canary })}\n${JSON.stringify(event("READ_FILE", true, "unsupported"))}\n${JSON.stringify(event("READ_FILE", true))}`,
    );
    expect(readActionOutcomes(dir)).toMatchObject({
      status: "partial",
      scannedRecords: 6,
      rejectedRecords: 4,
      acceptedEvents: 1,
    });
  });
  it("exports missing, empty and failed reads without throwing or retaining errors", () => {
    const dir = root();
    expect(readActionOutcomes(dir)).toMatchObject({
      status: "unavailable",
      journalAvailable: false,
      acceptedEvents: 0,
    });
    journal(dir, []);
    expect(readActionOutcomes(dir)).toMatchObject({
      status: "complete",
      acceptedEvents: 0,
    });
    const invalidDir = root();
    mkdirSync(journalPath(invalidDir));
    expect(readActionOutcomes(invalidDir)).toMatchObject({
      status: "partial",
      rejectedRecords: 1,
    });
    const symlinkDir = root();
    const target = join(symlinkDir, "private.txt");
    writeFileSync(target, canary);
    symlinkSync(target, journalPath(symlinkDir));
    expect(readActionOutcomes(symlinkDir)).toMatchObject({
      status: "partial",
      rejectedRecords: 1,
      bytesRead: 0,
    });
  });
  it("caps bytes and all scanned records, including ignored categories", () => {
    const dir = root();
    journal(
      dir,
      Array.from({ length: ACTION_DIAGNOSTIC_EVENT_LIMIT + 1 }, () => ({
        category: "model",
      })),
    );
    expect(readActionOutcomes(dir)).toMatchObject({
      status: "partial",
      truncated: true,
      scannedRecords: ACTION_DIAGNOSTIC_EVENT_LIMIT,
      acceptedEvents: 0,
    });
    journal(dir, [{ text: canary.repeat(10000) }]);
    expect(readActionOutcomes(dir)).toMatchObject({
      status: "partial",
      truncated: true,
      bytesRead: ACTION_DIAGNOSTIC_BYTE_LIMIT,
      acceptedEvents: 0,
    });
  });
  it("rejects a symlinked trajectories directory without counting the foreign journal", () => {
    const owned = root();
    const foreign = root();
    journal(foreign, [event("SHELL", false), event("READ_FILE", true)]);
    symlinkSync(join(foreign, "trajectories"), join(owned, "trajectories"));
    const result = readActionOutcomes(owned);
    expect(result).toMatchObject({
      status: "partial",
      bytesRead: 0,
      scannedRecords: 0,
      acceptedEvents: 0,
      rejectedRecords: 1,
    });
    for (const counts of Object.values(result.categories))
      expect(counts).toEqual({
        started: 0,
        completed: 0,
        success: 0,
        failure: 0,
        unknown: 0,
      });
    expect(JSON.stringify(result)).not.toContain(foreign);
    expect(JSON.stringify(result)).not.toContain(canary);
    expect(readActionOutcomes(foreign).acceptedEvents).toBe(2);
  });
  it("rejects a symlinked data root without counting the foreign journal", () => {
    const owned = root();
    const foreign = root();
    journal(foreign, [event("SHELL", false), event("READ_FILE", true)]);
    const linkedData = join(owned, "data");
    symlinkSync(foreign, linkedData);
    const result = readActionOutcomes(linkedData);
    expect(result).toMatchObject({
      status: "partial",
      bytesRead: 0,
      scannedRecords: 0,
      acceptedEvents: 0,
      rejectedRecords: 1,
    });
    for (const counts of Object.values(result.categories))
      expect(counts).toEqual({
        started: 0,
        completed: 0,
        success: 0,
        failure: 0,
        unknown: 0,
      });
    expect(JSON.stringify(result)).not.toContain(foreign);
    expect(JSON.stringify(result)).not.toContain(canary);
    expect(readActionOutcomes(foreign).acceptedEvents).toBe(2);
  });
  it("default mode does no extra action read/write and leaves schema-v5 report unchanged", async () => {
    const reportDir = root();
    const reader = vi.spyOn(outcomesModule, "readActionOutcomes");
    const writer = vi.fn();
    const result = await runHeadlessEvalSuite(suite, {
      reportDir,
      execute: () => success,
      writeActionDiagnosticsReceipt: writer,
    });
    expect(reader).not.toHaveBeenCalled();
    expect(writer).not.toHaveBeenCalled();
    expect(result.actionDiagnosticsReceiptStatus).toBe("disabled");
    expect(result.report.executionOverrides).toEqual([]);
    expect(result.report.schemaVersion).toBe(5);
    expect(result.report.evaluatorVersion).toBe("0.2.12");
    expect(result.report).not.toHaveProperty("actionDiagnostics");
    expect(dirname(result.reportPath)).toBe(reportDir);
    const ownedReportPath = join(reportDir, basename(result.reportPath));
    expect(existsSync(`${ownedReportPath}.actions.json`)).toBe(false);
  });
  it("does not read live task journals or write receipts when child cleanup is unconfirmed", async () => {
    const reportDir = root();
    const reader = vi.spyOn(outcomesModule, "readActionOutcomes");
    let retainedRunRoot = "";
    await expect(
      runHeadlessEvalSuite(suite, {
        reportDir,
        recordActionDiagnostics: true,
        execute: (_command, _args, options) => {
          const dataDir = options.env.DOOLITTLE_DATA_DIR;
          if (!dataDir) throw new Error("Missing isolated directory.");
          expect(basename(dataDir)).toBe("data");
          expect(basename(dirname(dataDir))).toBe("one");
          retainedRunRoot = dirname(dirname(dataDir));
          expect(basename(retainedRunRoot)).toMatch(
            /^doolittle-headless-eval-[a-zA-Z0-9]+$/u,
          );
          expect(realpathSync(dirname(retainedRunRoot))).toBe(
            realpathSync(tmpdir()),
          );
          // This synthetic executor has no real child. Track only its validated
          // runner-created root for afterEach cleanup, not any live/foreign state.
          roots.push(retainedRunRoot);
          journal(dataDir, [event("SHELL", false)]);
          return { ...success, cleanupSafe: false };
        },
      }),
    ).rejects.toThrow();
    expect(reader).not.toHaveBeenCalled();
    expect(readdirSync(reportDir)).toEqual([]);
    expect(existsSync(retainedRunRoot)).toBe(true);
  });
  it("does not project a substituted ordinary task root and retains it without persistence", async () => {
    const reportDir = root();
    const reader = vi.spyOn(outcomesModule, "readActionOutcomes");
    let replacementDataDir = "";
    let movedTaskRoot = "";
    await expect(
      runHeadlessEvalSuite(suite, {
        reportDir,
        recordActionDiagnostics: true,
        execute: (_command, _args, options) => {
          const dataDir = options.env.DOOLITTLE_DATA_DIR;
          if (!dataDir) throw new Error("Missing isolated directory.");
          expect(basename(dataDir)).toBe("data");
          const taskRoot = dirname(dataDir);
          expect(basename(taskRoot)).toBe("one");
          const runRoot = dirname(taskRoot);
          expect(basename(runRoot)).toMatch(
            /^doolittle-headless-eval-[a-zA-Z0-9]+$/u,
          );
          expect(realpathSync(dirname(runRoot))).toBe(realpathSync(tmpdir()));
          // Both the original and replacement are synthetic test-owned state
          // within this validated runner root, never real child/foreign state.
          roots.push(runRoot);
          movedTaskRoot = join(runRoot, "one.original");
          renameSync(taskRoot, movedTaskRoot);
          replacementDataDir = join(runRoot, "one", "data");
          journal(replacementDataDir, [event("SHELL", false)]);
          return success;
        },
      }),
    ).rejects.toThrow("substituted headless directory");
    expect(reader).not.toHaveBeenCalled();
    expect(readdirSync(reportDir)).toEqual([]);
    expect(statSync(movedTaskRoot).isDirectory()).toBe(true);
    expect(
      readFileSync(
        join(replacementDataDir, "trajectories", "trajectory-events.jsonl"),
        "utf8",
      ),
    ).toBe(JSON.stringify(event("SHELL", false)));
  });
  it("projects before cleanup and writes owner-only report-bound receipts after successful grading", async () => {
    const reportDir = root();
    let taskRoot = "";
    const result = await runHeadlessEvalSuite(suite, {
      reportDir,
      recordActionDiagnostics: true,
      execute: (_command, _args, options) => {
        const dataDir = options.env.DOOLITTLE_DATA_DIR;
        if (!dataDir) throw new Error("Missing isolated directory.");
        taskRoot = dirname(dataDir);
        journal(dataDir, [event("READ_FILE", true), event("SHELL", false)]);
        return success;
      },
    });
    expect(result.exitCode).toBe(0);
    expect(existsSync(taskRoot)).toBe(false);
    expect(result.actionDiagnosticsReceiptStatus).toBe("written");
    expect(result.report.executionOverrides).toHaveLength(1);
    expect(dirname(result.reportPath)).toBe(reportDir);
    const ownedReportPath = join(reportDir, basename(result.reportPath));
    const reportBytes = readFileSync(ownedReportPath, "utf8");
    const receiptBytes = readFileSync(
      `${ownedReportPath}.actions.json`,
      "utf8",
    );
    const receipt = JSON.parse(receiptBytes);
    expect(receipt).toMatchObject({
      schemaVersion: 1,
      reportSchemaVersion: 5,
      evaluatorVersion: "0.2.12",
      reportSha256: digest(reportBytes),
      mode: "opt-in-action-diagnostics",
      runs: [
        {
          reportRunIndex: 0,
          outcomes: { acceptedEvents: 2, status: "complete" },
        },
      ],
    });
    expect(receipt.runs[0].outcomes.categories.shell.failure).toBe(1);
    expect(statSync(`${ownedReportPath}.actions.json`).mode & 0o777).toBe(
      0o600,
    );
    expect(receiptBytes).not.toContain(canary);
    expect(receiptBytes).not.toContain(taskRoot);
    expect(receiptBytes).not.toContain("READ_FILE");
    expect(reportBytes).not.toContain(canary);
  });
  it("unexpected optional reader exceptions cannot change grading or expose errors", async () => {
    vi.spyOn(outcomesModule, "readActionOutcomes").mockImplementation(() => {
      throw new Error(canary);
    });
    const reportDir = root();
    const result = await runHeadlessEvalSuite(suite, {
      reportDir,
      recordActionDiagnostics: true,
      execute: () => success,
    });
    expect(result.exitCode).toBe(0);
    expect(dirname(result.reportPath)).toBe(reportDir);
    const ownedReportPath = join(reportDir, basename(result.reportPath));
    const bytes = readFileSync(`${ownedReportPath}.actions.json`, "utf8");
    expect(JSON.parse(bytes).runs[0].outcomes).toMatchObject({
      status: "partial",
      rejectedRecords: 1,
    });
    expect(bytes).not.toContain(canary);
  });
  it("optional action observers cannot abort grading or expose their exceptions", async () => {
    const reportDir = root();
    const result = await runHeadlessEvalSuite(suite, {
      reportDir,
      recordActionDiagnostics: true,
      execute: () => success,
      onActionLabels: () => {
        throw new Error(canary);
      },
    });
    expect(result.exitCode).toBe(0);
    expect(result.actionDiagnosticsReceiptStatus).toBe("written");
    expect(dirname(result.reportPath)).toBe(reportDir);
    const ownedReportPath = join(reportDir, basename(result.reportPath));
    expect(readFileSync(ownedReportPath, "utf8")).not.toContain(canary);
    expect(
      readFileSync(`${ownedReportPath}.actions.json`, "utf8"),
    ).not.toContain(canary);
  });
  it("optional writer exceptions cannot change grading or completed cleanup", async () => {
    const reportDir = root();
    const result = await runHeadlessEvalSuite(suite, {
      reportDir,
      recordActionDiagnostics: true,
      execute: () => success,
      writeActionDiagnosticsReceipt: () => {
        throw new Error(canary);
      },
    });
    expect(result.exitCode).toBe(0);
    expect(result.actionDiagnosticsReceiptStatus).toBe("unavailable");
    expect(dirname(result.reportPath)).toBe(reportDir);
    const ownedReportPath = join(reportDir, basename(result.reportPath));
    expect(readFileSync(ownedReportPath, "utf8")).not.toContain(canary);
    expect(existsSync(`${ownedReportPath}.actions.json`)).toBe(false);
  });
  it.each(["rejected", "never-settling"])(
    "optional %s async observers are observed without waiting or claiming completion",
    async (mode) => {
      const result = await runHeadlessEvalSuite(suite, {
        reportDir: root(),
        recordActionDiagnostics: true,
        execute: () => success,
        onActionLabels: () =>
          mode === "rejected"
            ? Promise.reject(new Error(canary))
            : new Promise<void>(() => undefined),
      });
      await Promise.resolve();
      expect(result.exitCode).toBe(0);
      expect(result.actionDiagnosticsReceiptStatus).toBe("written");
    },
  );
  it("default exclusive creation preserves a pre-existing sidecar without changing grading", async () => {
    const reportDir = root();
    const result = await runHeadlessEvalSuite(suite, {
      reportDir,
      recordActionDiagnostics: true,
      execute: () => success,
      writeMeasurementReceipt: (path) => {
        expect(dirname(path)).toBe(reportDir);
        const reportName = basename(path).replace(/\.measurement\.json$/u, "");
        writeFileSync(join(reportDir, `${reportName}.actions.json`), canary, {
          mode: 0o600,
          flag: "wx",
        });
      },
    });
    expect(result.exitCode).toBe(0);
    expect(result.actionDiagnosticsReceiptStatus).toBe("unavailable");
    expect(dirname(result.reportPath)).toBe(reportDir);
    const ownedReportPath = join(reportDir, basename(result.reportPath));
    expect(readFileSync(`${ownedReportPath}.actions.json`, "utf8")).toBe(
      canary,
    );
  });
  it("diagnostics do not promote an unsuccessful CLI task to successful grading", async () => {
    const result = await runHeadlessEvalSuite(suite, {
      reportDir: root(),
      recordActionDiagnostics: true,
      execute: () => ({ ...success, status: 1 }),
    });
    expect(result.exitCode).toBe(1);
    expect(result.report.runs[0]?.status).toBe("failed");
    expect(result.actionDiagnosticsReceiptStatus).toBe("written");
  });
  it.each(["rejected", "never-settling"])(
    "unsupported %s async writers cannot stall grading or become unhandled rejections",
    async (mode) => {
      const result = await runHeadlessEvalSuite(suite, {
        reportDir: root(),
        recordActionDiagnostics: true,
        execute: () => success,
        writeActionDiagnosticsReceipt: () =>
          mode === "rejected"
            ? Promise.reject(new Error(canary))
            : new Promise<void>(() => undefined),
      });
      await Promise.resolve();
      expect(result.exitCode).toBe(0);
      expect(result.actionDiagnosticsReceiptStatus).toBe("unavailable");
      // A truly hanging synchronous callback cannot be preempted in this thread;
      // no timeout claim is made and such trusted hooks must return promptly.
    },
  );
});
