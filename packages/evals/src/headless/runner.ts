import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import { getLinkedElizaCloudCredentials } from "@doolittle/agent/runtime/native/account-auth";
import { DEFAULT_MODEL_ROUTE } from "@doolittle/contracts";
import { EVALS_EVALUATOR_VERSION } from "../evaluator-version";
import type { HeadlessEvalSuite } from "./cases";
import { readHeadlessModelUsage } from "./model-usage";
import {
  executeHeadlessChild,
  type HeadlessExecResult,
  type HeadlessExecutor,
} from "./process";
import {
  type HeadlessActionLabelDiagnostic,
  hasFailedResearchAction,
  readFirstModelRequestAtMs,
  readHeadlessActionLabelDiagnostic,
  readHeadlessTraceSummary,
} from "./trace-summary";

export type { HeadlessModelUsage } from "./model-usage";

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
    /** Sum of full `nub ... exec` invocations, including CLI startup, providers/models, and tools. */
    execDurationMs: number;
    /** First model.request journal event in the first invocation, relative to exec start; null if absent. */
    execToFirstModelRequestMs: number | null;
    /** First model-progress text in the first invocation, measured from exec start; null if no stream text arrived. */
    execToFirstAssistantTextMs: number | null;
    execInvocations: number;
    gradingMs: number;
  };
  /** Provider-reported call timings/token counts; null means none were emitted. */
  modelUsage: import("./model-usage").HeadlessModelUsage | null;
  traceSummary: import("./trace-summary").HeadlessTraceSummary;
  responseSha256?: string;
  responseSha256s: Array<string | null>;
  checks: HeadlessEvalCheckResult[];
  humanReviewRequired: boolean;
  diagnosticFlags: string[];
  errorCode?: string;
}

export interface HeadlessEvalReport {
  schemaVersion: 4;
  evaluatorVersion: string;
  suite: { id: string; version: number; title: string };
  routeLabel: string;
  route: {
    provider: string;
    model: string;
    reasoningEffort: string;
  };
  source: { revision: string | null; workingTreeClean: boolean | null };
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
  onActionLabels?: (
    taskId: string,
    diagnostic: HeadlessActionLabelDiagnostic,
  ) => void;
  onResponse?: (
    taskId: string,
    response: string,
    turnNumber: number,
    turnTotal: number,
  ) => void;
  taskIds?: string[];
  now?: () => Date;
  wallNow?: () => number;
  monotonicNow?: () => number;
  execute?: HeadlessExecutor;
}

const defaultRepoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../",
);
function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function durationMs(startedAt: number, endedAt: number): number {
  return Math.max(0, Math.round(endedAt - startedAt));
}

function isAssistantTextProgress(line: string): boolean {
  try {
    const event: unknown = JSON.parse(line);
    if (typeof event !== "object" || event === null) {
      return false;
    }
    const record = event as Record<string, unknown>;
    if (record.type !== "progress" || record.phase !== "model") return false;
    return ["delta", "response", "chunk"].some((key) => {
      const value = record[key];
      return typeof value === "string" && value.trim().length > 0;
    });
  } catch {
    return false;
  }
}

function configuredElizaCloudCredentials():
  | { apiKey: string; baseUrl?: string }
  | undefined {
  const environmentApiKey =
    process.env.ELIZAOS_CLOUD_API_KEY?.trim() ||
    process.env.ELIZA_CLOUD_API_KEY?.trim();
  if (environmentApiKey) {
    const baseUrl = process.env.ELIZAOS_CLOUD_BASE_URL?.trim();
    return { apiKey: environmentApiKey, ...(baseUrl ? { baseUrl } : {}) };
  }

  // The environment was checked above, so this resolves stored credentials
  // without triggering the auth module's environment-to-store persistence.
  const stored = getLinkedElizaCloudCredentials();
  const apiKey = stored?.apiKey?.trim();
  if (!apiKey) return undefined;

  const baseUrl =
    process.env.ELIZAOS_CLOUD_BASE_URL?.trim() || stored?.baseUrl?.trim();
  return { apiKey, ...(baseUrl ? { baseUrl } : {}) };
}

function resultFromStdout(stdout: string): { ok?: boolean; text?: string } {
  let finalStreamText: string | undefined;
  let streamCompleted: boolean | undefined;
  let streamShouldExit: boolean | undefined;
  let directJsonResult: { ok?: boolean; text?: string } | undefined;
  for (const line of stdout.split(/\r?\n/).reverse()) {
    try {
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed !== "object" || parsed === null) continue;
      if ("type" in parsed && parsed.type === "completed") {
        const event = parsed as { status?: unknown };
        streamCompleted = event.status === "completed";
      } else if ("type" in parsed && parsed.type === "result") {
        const event = parsed as {
          text?: unknown;
          shouldExit?: unknown;
        };
        if (typeof event.text === "string") {
          finalStreamText = event.text;
          streamShouldExit = event.shouldExit === false;
        }
      } else if ("text" in parsed && "ok" in parsed) {
        const result = parsed as { ok?: unknown; text?: unknown };
        directJsonResult = {
          ok: result.ok === true,
          text: typeof result.text === "string" ? result.text : "",
        };
      }
    } catch {
      // Nub prints its script banner around JSON CLI output.
    }
  }
  if (directJsonResult) return directJsonResult;
  if (finalStreamText !== undefined) {
    return {
      ok: streamCompleted === true && streamShouldExit === true,
      text: finalStreamText,
    };
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

function readSourceIdentity(repoRoot: string): {
  revision: string | null;
  workingTreeClean: boolean | null;
} {
  try {
    const revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return {
      revision: /^[a-f0-9]{40}$/i.test(revision) ? revision : null,
      workingTreeClean: status.length === 0,
    };
  } catch {
    return { revision: null, workingTreeClean: null };
  }
}

export async function runHeadlessEvalSuite(
  suite: HeadlessEvalSuite,
  options: RunHeadlessEvalOptions = {},
): Promise<{
  report: HeadlessEvalReport;
  reportPath: string;
  exitCode: number;
}> {
  const now = options.now ?? (() => new Date());
  const wallNow = options.wallNow ?? Date.now;
  const monotonicNow = options.monotonicNow ?? (() => performance.now());
  const execute = options.execute ?? executeHeadlessChild;
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
  if (
    selectedTasks.some((task) =>
      [task.prompt, ...(task.followUpPrompts ?? [])].some(
        (prompt) => !prompt.trim(),
      ),
    )
  ) {
    throw new Error("Headless evaluation prompts must not be empty.");
  }

  const suiteStartedAt = monotonicNow();
  const sourceAtStart = readSourceIdentity(repoRoot);
  const cloudResearchOptedIn = Boolean(
    options.enableConfiguredCloudResearch &&
      selectedTasks.some((task) => task.domain === "research"),
  );
  const cloudCredentials = cloudResearchOptedIn
    ? configuredElizaCloudCredentials()
    : undefined;
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
      const prompts = [task.prompt, ...(task.followUpPrompts ?? [])];
      const sessionId =
        prompts.length > 1 ? `doolittle-eval:${randomUUID()}` : undefined;
      const responses: string[] = [];
      const responseSha256s: Array<string | null> = [];
      const diagnosticFlags = new Set<string>();
      if (
        task.domain === "research" &&
        cloudResearchOptedIn &&
        !cloudCredentials?.apiKey
      ) {
        diagnosticFlags.add("research-provider-credentials-unavailable");
      }
      let execDurationMs = 0;
      let execToFirstModelRequestMs: number | null = null;
      let execToFirstAssistantTextMs: number | null = null;
      let execInvocations = 0;
      let finalError: Error | undefined;
      let finalSignal: NodeJS.Signals | null = null;
      let completed = true;

      for (const [index, prompt] of prompts.entries()) {
        const execStartedAt = monotonicNow();
        const execStartedWallAt = wallNow();
        const stdoutDecoder = new StringDecoder("utf8");
        let stdoutLineBuffer = "";
        const observeStdout = (chunk: Buffer) => {
          if (index !== 0 || execToFirstAssistantTextMs !== null) return;
          stdoutLineBuffer += stdoutDecoder.write(chunk);
          let newlineIndex = stdoutLineBuffer.indexOf("\n");
          while (newlineIndex >= 0) {
            const line = stdoutLineBuffer.slice(0, newlineIndex).trim();
            stdoutLineBuffer = stdoutLineBuffer.slice(newlineIndex + 1);
            if (isAssistantTextProgress(line)) {
              execToFirstAssistantTextMs = durationMs(
                execStartedAt,
                monotonicNow(),
              );
              return;
            }
            newlineIndex = stdoutLineBuffer.indexOf("\n");
          }
          // Avoid retaining an unexpectedly long non-JSON line in memory.
          if (stdoutLineBuffer.length > 1_048_576) stdoutLineBuffer = "";
        };
        const childEnvironment: NodeJS.ProcessEnv = {
          ...process.env,
          DOOLITTLE_MODE: "cli",
          DOOLITTLE_DATA_DIR: dataDir,
          DOOLITTLE_WORKSPACE_DIR: workspaceDir,
          DOOLITTLE_USE_LINKED_CODEX_AUTH:
            process.env.DOOLITTLE_USE_LINKED_CODEX_AUTH ?? "true",
          DOOLITTLE_EVAL_CAPTURE_MODEL_USAGE: "true",
          ELIZAOS_CLOUD_ENABLED: "false",
        };
        delete childEnvironment.ELIZAOS_CLOUD_API_KEY;
        delete childEnvironment.ELIZA_CLOUD_API_KEY;
        if (
          task.domain === "research" &&
          cloudResearchOptedIn &&
          cloudCredentials?.apiKey
        ) {
          childEnvironment.ELIZAOS_CLOUD_ENABLED = "true";
          childEnvironment.ELIZAOS_CLOUD_API_KEY = cloudCredentials.apiKey;
          if (cloudCredentials.baseUrl) {
            childEnvironment.ELIZAOS_CLOUD_BASE_URL = cloudCredentials.baseUrl;
          }
        }
        const child: HeadlessExecResult = await execute(
          "nub",
          [
            "packages/agent/src/index.ts",
            "exec",
            "--prompt",
            prompt,
            "--json-stream",
            ...(sessionId ? ["--session-id", sessionId] : []),
          ],
          {
            cwd: repoRoot,
            timeoutMs: 300_000,
            maxBufferBytes: 10 * 1024 * 1024,
            env: childEnvironment,
            onStdoutChunk: observeStdout,
          },
        );
        const execEndedAt = monotonicNow();
        const invocationDurationMs = durationMs(execStartedAt, execEndedAt);
        execDurationMs += invocationDurationMs;
        if (index === 0) {
          const firstModelRequestAtMs = readFirstModelRequestAtMs(dataDir);
          if (firstModelRequestAtMs !== null) {
            const elapsedToFirstModelRequest =
              firstModelRequestAtMs - execStartedWallAt;
            if (
              elapsedToFirstModelRequest >= 0 &&
              elapsedToFirstModelRequest <= invocationDurationMs + 250
            ) {
              execToFirstModelRequestMs = Math.round(
                elapsedToFirstModelRequest,
              );
            }
          }
        }
        execInvocations += 1;
        finalError = child.error ?? undefined;
        finalSignal = child.signal;

        const cliResult = resultFromStdout(child.stdout ?? "");
        const response = cliResult.text ?? "";
        responses.push(response);
        responseSha256s.push(response ? sha256(response) : null);
        if (options.showResponses) {
          options.onResponse?.(task.id, response, index + 1, prompts.length);
        }

        const stderr = child.stderr ?? "";
        if (/Semantic memory is unavailable/i.test(stderr)) {
          diagnosticFlags.add("semantic-memory-provider-unavailable");
        }
        if (/invalid_refresh_token/i.test(stderr)) {
          diagnosticFlags.add("linked-codex-token-refresh-failed");
        }
        if (
          task.domain === "research" &&
          (hasFailedResearchAction(dataDir) ||
            /^Deep research (?:failed|is disabled|is unavailable):?/iu.test(
              response.trim(),
            ))
        ) {
          diagnosticFlags.add(
            /\b(?:401|403)\b|authentication_required|unauthorized/iu.test(
              response,
            )
              ? "research-provider-authentication-failed"
              : /\bis disabled\b/iu.test(response)
                ? "research-provider-disabled"
                : "research-provider-unavailable",
          );
        }

        completed =
          child.status === 0 && cliResult.ok === true && response.length > 0;
        if (!completed) break;
      }

      const gradingStartedAt = monotonicNow();
      const response = responses.at(-1) ?? "";
      const modelUsageResult = readHeadlessModelUsage(dataDir);
      const traceSummary = readHeadlessTraceSummary(dataDir);
      options.onActionLabels?.(
        task.id,
        readHeadlessActionLabelDiagnostic(dataDir),
      );
      const checkContext = {
        response,
        responses,
        workspaceDir,
        actionStarts:
          traceSummary.journalAvailable && !traceSummary.malformed
            ? traceSummary.actionStarts
            : null,
      };
      const checks = task.checks.map((check) => ({
        id: check.id,
        passed: Boolean(check.evaluate(checkContext)),
      }));
      const gradingMs = durationMs(gradingStartedAt, monotonicNow());
      if (modelUsageResult.malformed) {
        diagnosticFlags.add("model-usage-telemetry-invalid");
      }
      if (!traceSummary.journalAvailable) {
        diagnosticFlags.add("trajectory-telemetry-unavailable");
      } else if (traceSummary.malformed) {
        diagnosticFlags.add("trajectory-telemetry-invalid");
      }
      runs.push({
        taskId: task.id,
        domain: task.domain,
        status: completed ? "completed" : "failed",
        // Includes response decoding/check execution for every follow-up turn.
        elapsedMs: Date.now() - startedAt,
        timing: {
          taskSetupMs,
          execDurationMs,
          execToFirstModelRequestMs,
          execToFirstAssistantTextMs,
          execInvocations,
          gradingMs,
        },
        modelUsage: modelUsageResult.usage,
        traceSummary,
        ...(response ? { responseSha256: sha256(response) } : {}),
        responseSha256s,
        checks,
        humanReviewRequired: task.humanReviewRequired,
        diagnosticFlags: [...diagnosticFlags],
        ...(!completed
          ? {
              errorCode: executionErrorCode(finalError, finalSignal),
            }
          : {}),
      });
    }

    const objectiveChecks = runs.flatMap((run) => run.checks);
    const suiteWallTimeMs = durationMs(suiteStartedAt, monotonicNow());
    const sourceAtEnd = readSourceIdentity(repoRoot);
    const sourceRevisionMatches =
      sourceAtStart.revision !== null &&
      sourceAtStart.revision === sourceAtEnd.revision;
    const source = {
      revision: sourceRevisionMatches ? sourceAtStart.revision : null,
      workingTreeClean: sourceRevisionMatches
        ? sourceAtStart.workingTreeClean === true &&
          sourceAtEnd.workingTreeClean === true
        : null,
    };
    const createdAt = now().toISOString();
    const report: HeadlessEvalReport = {
      schemaVersion: 4,
      evaluatorVersion: EVALS_EVALUATOR_VERSION,
      suite: { id: suite.id, version: suite.version, title: suite.title },
      routeLabel:
        options.routeLabel?.trim() ||
        `${DEFAULT_MODEL_ROUTE.provider}/${DEFAULT_MODEL_ROUTE.model}:${DEFAULT_MODEL_ROUTE.reasoningEffort}`,
      route: {
        provider: DEFAULT_MODEL_ROUTE.provider,
        model: DEFAULT_MODEL_ROUTE.model,
        reasoningEffort: DEFAULT_MODEL_ROUTE.reasoningEffort,
      },
      source,
      createdAt,
      executionOverrides: cloudResearchOptedIn
        ? [
            cloudCredentials?.apiKey
              ? "Eliza Cloud was enabled only for opted-in research tasks; its API key was supplied through that child process environment and never written to reports."
              : "Eliza Cloud research was opted in, but no configured API key was available; no key was passed to any task process.",
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
