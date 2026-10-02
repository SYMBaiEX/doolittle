import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { DEFAULT_MODEL_ROUTE } from "@doolittle/contracts";
import type { HeadlessEvalSuite } from "./cases";

export interface HeadlessEvalCheckResult {
  id: string;
  passed: boolean;
}

export interface HeadlessEvalRunResult {
  taskId: string;
  domain: string;
  status: "completed" | "failed";
  /** Legacy wall-clock from before exec through response parsing and grading. */
  elapsedMs: number;
  timing: {
    taskSetupMs: number;
    /** Full `nub ... exec` child invocation, including CLI startup, providers/models, and tools. */
    execDurationMs: number;
    gradingMs: number;
  };
  responseSha256?: string;
  checks: HeadlessEvalCheckResult[];
  humanReviewRequired: boolean;
  diagnosticFlags: string[];
  errorCode?: string;
}

export interface HeadlessEvalReport {
  schemaVersion: 2;
  evaluatorVersion: string;
  suite: { id: string; version: number; title: string };
  routeLabel: string;
  route: {
    provider: string;
    model: string;
    reasoningEffort: string;
  };
  createdAt: string;
  executionOverrides: string[];
  summary: {
    total: number;
    completed: number;
    objectiveChecksPassed: number;
    objectiveChecksTotal: number;
    humanReviewRequired: number;
    /** From run-root creation through final grading; excludes report persistence and temp cleanup. */
    suiteWallTimeMs: number;
  };
  runs: HeadlessEvalRunResult[];
}

export interface RunHeadlessEvalOptions {
  repoRoot?: string;
  reportDir?: string;
  routeLabel?: string;
  enableConfiguredCloudResearch?: boolean;
  showResponses?: boolean;
  onResponse?: (taskId: string, response: string) => void;
  taskIds?: string[];
  now?: () => Date;
  monotonicNow?: () => number;
  execute?: typeof spawnSync;
}

const defaultRepoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../",
);
const evalPackageVersion = (
  JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { version: string }
).version;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function durationMs(startedAt: number, endedAt: number): number {
  return Math.max(0, Math.round(endedAt - startedAt));
}

function resultFromStdout(stdout: string): { ok?: boolean; text?: string } {
  for (const line of stdout.split(/\r?\n/).reverse()) {
    try {
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed === "object" && parsed !== null && "text" in parsed) {
        const result = parsed as { ok?: unknown; text?: unknown };
        return {
          ok: result.ok === true,
          text: typeof result.text === "string" ? result.text : "",
        };
      }
    } catch {
      // Nub prints its script banner around the CLI's single-line JSON result.
    }
  }
  return {};
}

function executionErrorCode(
  error: Error | undefined,
  signal: NodeJS.Signals | null,
): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (typeof code === "string") return code;
  if (signal) return `signal:${signal}`;
  return "headless-exec-failed";
}

function reportDirectory(explicit?: string): string {
  if (explicit?.trim()) return resolve(explicit);
  const stateHome =
    process.env.XDG_STATE_HOME?.trim() || join(homedir(), ".local", "state");
  return join(stateHome, "doolittle", "evals", "headless");
}

export function runHeadlessEvalSuite(
  suite: HeadlessEvalSuite,
  options: RunHeadlessEvalOptions = {},
): { report: HeadlessEvalReport; reportPath: string; exitCode: number } {
  const now = options.now ?? (() => new Date());
  const monotonicNow = options.monotonicNow ?? (() => performance.now());
  const execute = options.execute ?? spawnSync;
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const selectedTasks = options.taskIds?.length
    ? suite.tasks.filter((task) => options.taskIds?.includes(task.id))
    : suite.tasks;
  if (
    options.taskIds?.some(
      (taskId) => !suite.tasks.some((task) => task.id === taskId),
    )
  ) {
    throw new Error("Unknown task ID in headless evaluation selection.");
  }
  if (selectedTasks.length === 0) {
    throw new Error("No headless evaluation tasks were selected.");
  }

  const suiteStartedAt = monotonicNow();
  const runRoot = mkdtempSync(join(tmpdir(), "doolittle-headless-eval-"));
  const runs: HeadlessEvalRunResult[] = [];
  try {
    for (const task of selectedTasks) {
      const taskSetupStartedAt = monotonicNow();
      const taskRoot = join(runRoot, task.id);
      const dataDir = join(taskRoot, "data");
      const workspaceDir = join(taskRoot, "workspace");
      mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      mkdirSync(workspaceDir, { recursive: true, mode: 0o700 });
      writeFileSync(join(dataDir, "onboarding.json"), "{}\n", {
        mode: 0o600,
      });
      const taskSetupMs = durationMs(taskSetupStartedAt, monotonicNow());

      const startedAt = Date.now();
      const execStartedAt = monotonicNow();
      const child = execute(
        "nub",
        [
          "packages/agent/src/index.ts",
          "exec",
          "--prompt",
          task.prompt,
          "--json",
        ],
        {
          cwd: repoRoot,
          encoding: "utf8",
          timeout: 300_000,
          maxBuffer: 10 * 1024 * 1024,
          env: {
            ...process.env,
            DOOLITTLE_MODE: "cli",
            DOOLITTLE_DATA_DIR: dataDir,
            DOOLITTLE_WORKSPACE_DIR: workspaceDir,
            DOOLITTLE_USE_LINKED_CODEX_AUTH:
              process.env.DOOLITTLE_USE_LINKED_CODEX_AUTH ?? "true",
            ELIZAOS_CLOUD_ENABLED:
              options.enableConfiguredCloudResearch &&
              task.domain === "research"
                ? "true"
                : "false",
          },
        },
      );
      const execDurationMs = durationMs(execStartedAt, monotonicNow());
      const gradingStartedAt = monotonicNow();
      const cliResult = resultFromStdout(child.stdout ?? "");
      const response = cliResult.text ?? "";
      const checkContext = { response, workspaceDir };
      const checks = task.checks.map((check) => ({
        id: check.id,
        passed: Boolean(check.evaluate(checkContext)),
      }));
      const gradingMs = durationMs(gradingStartedAt, monotonicNow());
      const diagnosticFlags: string[] = [];
      const stderr = child.stderr ?? "";
      if (/Semantic memory is unavailable/i.test(stderr)) {
        diagnosticFlags.push("semantic-memory-provider-unavailable");
      }
      if (/invalid_refresh_token/i.test(stderr)) {
        diagnosticFlags.push("linked-codex-token-refresh-failed");
      }
      const completed =
        child.status === 0 && cliResult.ok === true && response.length > 0;
      runs.push({
        taskId: task.id,
        domain: task.domain,
        status: completed ? "completed" : "failed",
        elapsedMs: Date.now() - startedAt,
        timing: { taskSetupMs, execDurationMs, gradingMs },
        ...(response ? { responseSha256: sha256(response) } : {}),
        checks,
        humanReviewRequired: task.humanReviewRequired,
        diagnosticFlags,
        ...(!completed
          ? {
              errorCode: executionErrorCode(child.error, child.signal),
            }
          : {}),
      });
      if (options.showResponses) options.onResponse?.(task.id, response);
    }

    const objectiveChecks = runs.flatMap((run) => run.checks);
    const cloudResearchEnabledForRun =
      options.enableConfiguredCloudResearch &&
      selectedTasks.some((task) => task.domain === "research");
    const suiteWallTimeMs = durationMs(suiteStartedAt, monotonicNow());
    const createdAt = now().toISOString();
    const report: HeadlessEvalReport = {
      schemaVersion: 2,
      evaluatorVersion: evalPackageVersion,
      suite: { id: suite.id, version: suite.version, title: suite.title },
      routeLabel:
        options.routeLabel?.trim() ||
        `${DEFAULT_MODEL_ROUTE.provider}/${DEFAULT_MODEL_ROUTE.model}:${DEFAULT_MODEL_ROUTE.reasoningEffort}`,
      route: {
        provider: DEFAULT_MODEL_ROUTE.provider,
        model: DEFAULT_MODEL_ROUTE.model,
        reasoningEffort: DEFAULT_MODEL_ROUTE.reasoningEffort,
      },
      createdAt,
      executionOverrides: cloudResearchEnabledForRun
        ? [
            "Eliza Cloud enabled only for research-domain tasks; credentials remain in the configured environment.",
          ]
        : [],
      summary: {
        total: runs.length,
        completed: runs.filter((run) => run.status === "completed").length,
        objectiveChecksPassed: objectiveChecks.filter((check) => check.passed)
          .length,
        objectiveChecksTotal: objectiveChecks.length,
        humanReviewRequired: runs.filter((run) => run.humanReviewRequired)
          .length,
        suiteWallTimeMs,
      },
      runs,
    };

    const directory = reportDirectory(options.reportDir);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const reportPath = join(
      directory,
      `${createdAt.replaceAll(/[:.]/g, "-")}-${suite.id}-v${suite.version}-${randomUUID()}.json`,
    );
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    const allPassed =
      report.summary.completed === report.summary.total &&
      report.summary.objectiveChecksPassed ===
        report.summary.objectiveChecksTotal;
    return { report, reportPath, exitCode: allPassed ? 0 : 1 };
  } finally {
    if (runRoot.startsWith(join(tmpdir(), "doolittle-headless-eval-"))) {
      rmSync(runRoot, { recursive: true, force: true });
    }
  }
}
