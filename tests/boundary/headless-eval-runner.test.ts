import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { HeadlessEvalSuite } from "../../packages/evals/src/headless/cases";
import {
  compareHeadlessEvalReports,
  readHeadlessEvalReport,
  validateHeadlessEvalReport,
} from "../../packages/evals/src/headless/compare";
import type { HeadlessExecutor } from "../../packages/evals/src/headless/process";
import { runHeadlessEvalSuite } from "../../packages/evals/src/headless/runner";

const roots = new Set<string>();
const posix = it.skipIf(process.platform === "win32");
afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.clear();
});

function reportDirectory() {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-headless-test-")),
  );
  roots.add(root);
  return join(root, "reports");
}

const suite: HeadlessEvalSuite = {
  id: "offline-boundary",
  version: 1,
  title: "Offline artifact acceptance",
  tasks: [
    {
      id: "artifact",
      domain: "coding",
      prompt: "Write answer.txt containing ready and report ready.",
      humanReviewRequired: false,
      checks: [
        {
          id: "final-answer",
          evaluate: ({ response }) => response === "ready",
        },
        {
          id: "artifact",
          evaluate: ({ workspaceDir }) =>
            existsSync(join(workspaceDir, "answer.txt")) &&
            readFileSync(join(workspaceDir, "answer.txt"), "utf8") === "ready",
        },
      ],
    },
  ],
};

function executor(
  options: { status?: number; response?: string; cleanupSafe?: boolean } = {},
) {
  const taskRoots: string[] = [];
  const execute = vi.fn<HeadlessExecutor>((command, args, child) => {
    expect(command).toBe("nub");
    expect(args).toContain("--json-stream");
    const data = child.env.DOOLITTLE_DATA_DIR as string;
    const taskRoot = dirname(data);
    roots.add(dirname(taskRoot));
    taskRoots.push(taskRoot);
    expect(existsSync(join(data, "onboarding.json"))).toBe(true);
    writeFileSync(join(taskRoot, "workspace", "answer.txt"), "ready");
    mkdirSync(join(data, "trajectories"));
    writeFileSync(join(data, "trajectories", "trajectory-events.jsonl"), "");
    return {
      status: options.status ?? 0,
      stdout: JSON.stringify({ ok: true, text: options.response ?? "ready" }),
      stderr: "",
      signal: null,
      cleanupSafe: options.cleanupSafe ?? true,
    };
  });
  return { execute, taskRoots };
}

posix(
  "grades and persists an offline artifact, then removes task and run state",
  async () => {
    const { execute, taskRoots } = executor();
    const result = await runHeadlessEvalSuite(suite, {
      execute,
      reportDir: reportDirectory(),
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.exitCode).toBe(0);
    expect(result.report.summary).toMatchObject({
      total: 1,
      completed: 1,
      objectiveChecksPassed: 2,
      objectiveChecksTotal: 2,
    });
    expect(result.report.runs[0]?.checks).toEqual([
      { id: "final-answer", passed: true },
      { id: "artifact", passed: true },
    ]);
    expect(readHeadlessEvalReport(result.reportPath)).toEqual(result.report);
    expect(() => validateHeadlessEvalReport(result.report)).not.toThrow();
    expect(statSync(result.reportPath).mode & 0o777).toBe(0o600);
    expect(result.measurementReceiptStatus).toBe("written");
    expect(existsSync(taskRoots[0] as string)).toBe(false);
    expect(existsSync(dirname(taskRoots[0] as string))).toBe(false);
  },
);

posix.each([
  { status: 1, response: "ready", completed: 0, passed: 2 },
  { status: 0, response: "wrong", completed: 1, passed: 1 },
  { status: 0, response: "", completed: 0, passed: 1 },
])(
  "keeps execution completion separate from objective scoring: %j",
  async ({ status, response, completed, passed }) => {
    const { execute, taskRoots } = executor({ status, response });
    const result = await runHeadlessEvalSuite(suite, {
      execute,
      reportDir: reportDirectory(),
    });
    expect(result.exitCode).toBe(1);
    expect(result.report.summary).toMatchObject({
      completed,
      objectiveChecksPassed: passed,
    });
    expect(existsSync(dirname(taskRoots[0] as string))).toBe(false);
  },
);

posix(
  "refuses empty suites and unknown task selections before dispatch or report allocation",
  async () => {
    const execute = vi.fn<HeadlessExecutor>();
    const reportDir = reportDirectory();
    await expect(
      runHeadlessEvalSuite({ ...suite, tasks: [] }, { execute, reportDir }),
    ).rejects.toThrow("No headless evaluation tasks");
    await expect(
      runHeadlessEvalSuite(suite, { execute, reportDir, taskIds: ["missing"] }),
    ).rejects.toThrow("Unknown task ID");
    expect(execute).not.toHaveBeenCalled();
    expect(existsSync(reportDir)).toBe(false);
  },
);

posix(
  "retains owned state rather than publishing a report when child cleanup is unconfirmed",
  async () => {
    const { execute, taskRoots } = executor({ cleanupSafe: false });
    const reportDir = reportDirectory();
    await expect(
      runHeadlessEvalSuite(suite, { execute, reportDir }),
    ).rejects.toThrow("cleanup could not be confirmed");
    expect(existsSync(taskRoots[0] as string)).toBe(true);
    expect(readdirSync(reportDir)).toEqual([]);
  },
);

posix(
  "compares persisted reports and rejects incompatible task/check identities and malformed input",
  async () => {
    const baseline = await runHeadlessEvalSuite(suite, {
      execute: executor({ response: "wrong" }).execute,
      reportDir: reportDirectory(),
    });
    const candidate = await runHeadlessEvalSuite(suite, {
      execute: executor().execute,
      reportDir: reportDirectory(),
    });
    const comparison = compareHeadlessEvalReports(
      readHeadlessEvalReport(baseline.reportPath),
      readHeadlessEvalReport(candidate.reportPath),
    );
    expect(comparison).toMatchObject({
      sampleSize: 1,
      executionCompletionDelta: 0,
      objectiveCheckSuccessDelta: 0.5,
    });
    expect(comparison.tasks[0]).toMatchObject({
      taskId: "artifact",
      baseline: { checksPassed: 1 },
      candidate: { checksPassed: 2 },
    });
    for (const incompatible of [
      { ...candidate.report, suite: { ...candidate.report.suite, version: 2 } },
      { ...candidate.report, runs: [] },
      {
        ...candidate.report,
        runs: candidate.report.runs.map((run) => ({
          ...run,
          taskId: "different",
        })),
      },
      {
        ...candidate.report,
        runs: candidate.report.runs.map((run) => ({
          ...run,
          checks: [{ id: "different", passed: true }],
        })),
      },
      null,
    ])
      expect(() =>
        compareHeadlessEvalReports(baseline.report, incompatible),
      ).toThrow();
    const broken = join(dirname(candidate.reportPath), "broken.json");
    writeFileSync(broken, "not JSON");
    expect(() => readHeadlessEvalReport(broken)).toThrow();
  },
);
