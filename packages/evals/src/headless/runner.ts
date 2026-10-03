import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import { getLinkedElizaCloudCredentials } from "@doolittle/agent/runtime/native/account-auth";
import { DEFAULT_MODEL_ROUTE } from "@doolittle/contracts";
import { EVALS_EVALUATOR_VERSION } from "../evaluator-version";
import { createEvalRuntimeEnvironment } from "../runtime-environment";
import type { HeadlessEvalSuite } from "./cases";
import {
  type AdvertisedRoute,
  advertisedRoute,
  type HarnessTiming,
  type RouteEvidence,
  readRequestedRouteEvidence,
  type TaskHarnessTiming,
} from "./measurement";
import { readHeadlessModelUsage } from "./model-usage";
import {
  preparePrivateReportDirectory,
  privateReportFilename,
  privateReportPath,
  verifyPrivateReportDirectory,
  writePrivateReportFile,
} from "./private-report";
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
  harnessTiming: TaskHarnessTiming;
  routeEvidence: RouteEvidence;
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
  schemaVersion: 5;
  evaluatorVersion: string;
  suite: { id: string; version: number; title: string };
  routeLabel: string;
  route: AdvertisedRoute;
  routeDeclaration: {
    provenance: "product-default";
    expectation: "fresh-isolated-settings-default";
    effectiveAttestation: "unavailable";
  };
  harnessTiming: HarnessTiming;
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
  /** Optional measurement write is best effort and must not change grading. */
  writeMeasurementReceipt?: (path: string, bytes: string) => void;
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
  if (
    typeof code === "string" &&
    [
      "ENOENT",
      "EACCES",
      "EPERM",
      "EIO",
      "EPIPE",
      "ETIMEDOUT",
      "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
      "ERR_HEADLESS_CLEANUP_UNCONFIRMED",
    ].includes(code)
  )
    return code;
  if (
    signal &&
    ["SIGINT", "SIGTERM", "SIGKILL", "SIGHUP", "SIGABRT", "SIGSEGV"].includes(
      signal,
    )
  )
    return `signal:${signal}`;
  return "headless-exec-failed";
}

function isSafeTaskId(taskId: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(taskId);
}

interface OwnedDirectory {
  path: string;
  canonical: string;
  dev: bigint;
  ino: bigint;
}

function ownedDirectory(path: string): OwnedDirectory {
  try {
    const stat = lstatSync(path, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error();
    return {
      path: resolve(path),
      canonical: realpathSync(path),
      dev: stat.dev,
      ino: stat.ino,
    };
  } catch {
    // Keep private directory paths out of safety-abort diagnostics.
    throw new Error("Headless owned directory is not an ordinary directory.");
  }
}

function verifyOwnedDirectory(owned: OwnedDirectory): void {
  const current = ownedDirectory(owned.path);
  if (
    current.canonical !== owned.canonical ||
    current.dev !== owned.dev ||
    current.ino !== owned.ino
  )
    throw new Error("Refusing to remove a substituted headless directory.");
}

function verifyOwnedTaskRoot(
  runRoot: OwnedDirectory,
  taskRoot: OwnedDirectory,
): void {
  verifyOwnedDirectory(runRoot);
  verifyOwnedDirectory(taskRoot);
  const taskId = basename(taskRoot.path);
  if (
    dirname(runRoot.canonical) !== realpathSync(tmpdir()) ||
    !basename(runRoot.canonical).startsWith("doolittle-headless-eval-") ||
    dirname(taskRoot.canonical) !== runRoot.canonical ||
    !isSafeTaskId(taskId) ||
    taskRoot.path !== join(runRoot.path, taskId)
  ) {
    throw new Error(
      "Refusing to remove a task root outside the owned run root.",
    );
  }
}

function removeOwnedTaskRoot(
  runRoot: OwnedDirectory,
  taskRoot: OwnedDirectory,
): void {
  verifyOwnedTaskRoot(runRoot, taskRoot);
  rmSync(taskRoot.path, { recursive: true, force: false });
}

function verifyEmptyRunRoot(runRoot: OwnedDirectory): void {
  verifyOwnedDirectory(runRoot);
  if (readdirSync(runRoot.path).length !== 0)
    throw new Error(
      "Headless run root contains unowned entries; owned state was retained.",
    );
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
    const status = execFileSync(
      "git",
      ["--no-optional-locks", "status", "--porcelain"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
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
  measurementReceiptStatus: "written" | "unavailable";
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
  if (selectedTasks.some((task) => !isSafeTaskId(task.id))) {
    throw new Error(
      "Headless evaluation task IDs must be safe path components.",
    );
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
  // Refuse unsafe persistence before dispatching any provider-backed child.
  privateReportFilename("2000-01-01T00:00:00.000Z", suite.id, suite.version);
  const reportDirectory = preparePrivateReportDirectory(options.reportDir);
  const sourceAtStart = readSourceIdentity(repoRoot);
  const cloudResearchOptedIn = Boolean(
    options.enableConfiguredCloudResearch &&
      selectedTasks.some((task) => task.domain === "research"),
  );
  const cloudCredentials = cloudResearchOptedIn
    ? configuredElizaCloudCredentials()
    : undefined;
  const runRoot = mkdtempSync(join(tmpdir(), "doolittle-headless-eval-"));
  const runIdentity = ownedDirectory(runRoot);
  const taskIdentities = new Map<string, OwnedDirectory>();
  const preflightMs = durationMs(suiteStartedAt, monotonicNow());
  let cleanupBlocked = false;
  let finalCleanupComplete = false;
  let childCleanupSafe = true;
  const runs: HeadlessEvalRunResult[] = [];
  let cleanupDurationMs = 0;
  try {
    for (const task of selectedTasks) {
      verifyEmptyRunRoot(runIdentity);
      const taskSetupStartedAt = monotonicNow();
      const taskRoot = join(runRoot, task.id);
      const dataDir = join(taskRoot, "data");
      const workspaceDir = join(taskRoot, "workspace");
      mkdirSync(taskRoot, { mode: 0o700 });
      const taskIdentity = ownedDirectory(taskRoot);
      taskIdentities.set(taskRoot, taskIdentity);
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
      let responseProcessingMs = 0;
      let finalError: Error | undefined;
      let finalSignal: NodeJS.Signals | null = null;
      let completed = true;

      for (const [index, prompt] of prompts.entries()) {
        verifyOwnedTaskRoot(runIdentity, taskIdentity);
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
        const childEnvironment = createEvalRuntimeEnvironment({
          repoRoot,
          root: taskRoot,
          workspaceDir,
          mode: "cli",
          baseEnvironment: process.env,
        });
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
        childCleanupSafe = false;
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
        const responseProcessingStartedAt = execEndedAt;
        childCleanupSafe = child.cleanupSafe === true;
        if (!childCleanupSafe) {
          cleanupBlocked = true;
          diagnosticFlags.add("headless-child-cleanup-unconfirmed");
        }
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
          childCleanupSafe &&
          child.error == null &&
          child.signal == null &&
          child.status === 0 &&
          cliResult.ok === true &&
          response.length > 0;
        responseProcessingMs += durationMs(
          responseProcessingStartedAt,
          monotonicNow(),
        );
        if (!completed) break;
      }

      const gradingStartedAt = monotonicNow();
      const response = responses.at(-1) ?? "";
      const modelUsageResult = readHeadlessModelUsage(dataDir);
      const traceSummary = readHeadlessTraceSummary(dataDir);
      let routeEvidence: RouteEvidence;
      try {
        if (!childCleanupSafe) throw new Error();
        verifyOwnedTaskRoot(runIdentity, taskIdentity);
        routeEvidence = readRequestedRouteEvidence(dataDir);
      } catch {
        // Optional projection never reads foreign/live state or changes grading.
        routeEvidence = {
          provenance: "doolittle-model-request-journal",
          coverage: "parent-turn-requests-only",
          status: "unavailable",
          journalAvailable: false,
          accepted: 0,
          rejected: 0,
          truncated: false,
          requested: [],
          effective: {
            status: "unavailable",
            provider: null,
            modelSha256: null,
            reasoningEffort: null,
          },
          worker: { status: "unavailable", provenance: null },
        };
      }
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
        harnessTiming: {
          coverage: "direct-phases-only",
          setupMs: taskSetupMs,
          responseProcessingMs,
          gradingMs,
          cleanupMs: 0,
        },
        routeEvidence,
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
      if (!childCleanupSafe)
        throw new Error(
          "Headless child cleanup could not be confirmed; owned state was retained.",
        );
      const cleanupStartedAt = monotonicNow();
      removeOwnedTaskRoot(runIdentity, taskIdentity);
      taskIdentities.delete(taskRoot);
      const taskCleanupMs = durationMs(cleanupStartedAt, monotonicNow());
      cleanupDurationMs += taskCleanupMs;
      const latestRun = runs.at(-1);
      if (!latestRun) throw new Error("Missing task measurement.");
      latestRun.harnessTiming.cleanupMs = taskCleanupMs;
    }

    const objectiveChecks = runs.flatMap((run) => run.checks);
    const suiteWallTimeMs = Math.max(
      0,
      Math.round(monotonicNow() - suiteStartedAt - cleanupDurationMs),
    );
    const reportPreparationStartedAt = monotonicNow();
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
      schemaVersion: 5,
      evaluatorVersion: EVALS_EVALUATOR_VERSION,
      suite: { id: suite.id, version: suite.version, title: suite.title },
      routeLabel: options.routeLabel?.trim()
        ? `sha256:${sha256(options.routeLabel.trim())}`
        : "product-default",
      route: advertisedRoute(DEFAULT_MODEL_ROUTE),
      routeDeclaration: {
        provenance: "product-default",
        expectation: "fresh-isolated-settings-default",
        effectiveAttestation: "unavailable",
      },
      harnessTiming: {
        coverage: "direct-phases-only",
        preflightMs,
        reportPreparationMs: 0,
        finalCleanupMs: 0,
        serializationMs: null,
        persistenceMs: null,
        untimed: "inter-phase-bookkeeping-and-receipt-write",
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

    const reportLeaf = privateReportFilename(
      createdAt,
      suite.id,
      suite.version,
    );
    const reportPath = privateReportPath(reportDirectory, reportLeaf);
    // Refuse persistence as well as deletion if the owned root was replaced
    // during callbacks/report preparation; never publish a shortened success.
    verifyEmptyRunRoot(runIdentity);
    report.harnessTiming.reportPreparationMs = durationMs(
      reportPreparationStartedAt,
      monotonicNow(),
    );
    const finalCleanupStartedAt = monotonicNow();
    verifyOwnedDirectory(runIdentity);
    if (readdirSync(runRoot).length !== 0)
      throw new Error("Owned run root was not empty at final cleanup.");
    rmdirSync(runRoot);
    finalCleanupComplete = true;
    report.harnessTiming.finalCleanupMs = durationMs(
      finalCleanupStartedAt,
      monotonicNow(),
    );
    const serializationStartedAt = monotonicNow();
    const reportBytes = `${JSON.stringify(report, null, 2)}\n`;
    const serializationMs = durationMs(serializationStartedAt, monotonicNow());
    const persistenceStartedAt = monotonicNow();
    writePrivateReportFile(reportDirectory, reportLeaf, reportBytes);
    const persistenceMs = durationMs(persistenceStartedAt, monotonicNow());
    let measurementReceiptStatus: "written" | "unavailable" = "unavailable";
    try {
      const receiptLeaf = `${reportLeaf}.measurement.json`;
      const receiptBytes = `${JSON.stringify({ schemaVersion: 1, provenance: "headless-harness-phase-clocks", reportSchemaVersion: 5, evaluatorVersion: EVALS_EVALUATOR_VERSION, reportSha256: sha256(reportBytes), serializationMs, persistenceMs, coverage: "completed-report-write-only", receiptWriteMs: null })}\n`;
      verifyPrivateReportDirectory(reportDirectory);
      if (options.writeMeasurementReceipt) {
        // Trusted injection seam; the default writer always uses descriptors.
        options.writeMeasurementReceipt(
          privateReportPath(reportDirectory, receiptLeaf),
          receiptBytes,
        );
        verifyPrivateReportDirectory(reportDirectory);
      } else writePrivateReportFile(reportDirectory, receiptLeaf, receiptBytes);
      measurementReceiptStatus = "written";
    } catch {
      /* Optional telemetry may not corrupt grading or expose an error. */
    }
    const allPassed =
      report.summary.completed === report.summary.total &&
      report.summary.objectiveChecksPassed ===
        report.summary.objectiveChecksTotal;
    return {
      report,
      reportPath,
      exitCode: allPassed ? 0 : 1,
      measurementReceiptStatus,
    };
  } catch (error) {
    // A refused identity guard or thrown executor must never be followed by
    // an unguarded recursive finally deletion of possibly foreign/live state.
    cleanupBlocked = true;
    throw error;
  } finally {
    if (!finalCleanupComplete && !cleanupBlocked && childCleanupSafe) {
      verifyOwnedDirectory(runIdentity);
      for (const taskIdentity of taskIdentities.values())
        verifyOwnedTaskRoot(runIdentity, taskIdentity);
      for (const taskIdentity of taskIdentities.values())
        removeOwnedTaskRoot(runIdentity, taskIdentity);
      // Never recursively delete unexpected entries in the run root.
      if (readdirSync(runRoot).length === 0) rmdirSync(runRoot);
    }
  }
}
