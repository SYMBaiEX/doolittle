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
import {
  type ActionOutcomes,
  readActionOutcomes,
  unavailableActionOutcomes,
} from "./action-outcomes";
import type { HeadlessEvalSuite } from "./cases";
import {
  CODING_VERIFICATION_FLAG,
  createCodingVerificationCollector,
} from "./coding-verification";
import {
  PLANNER_ALIAS_TOOL_DEDUPLICATION_FLAG,
  PLANNER_ALIAS_TOOL_DEDUPLICATION_OVERRIDE,
} from "./execution-overrides";
import {
  type AdvertisedRoute,
  advertisedRoute,
  type HarnessTiming,
  type RouteEvidence,
  readRequestedRouteEvidence,
  type TaskHarnessTiming,
} from "./measurement";
import {
  MODEL_INPUT_FLAG,
  type ModelInputObservations,
  pinModelInputDataRoot,
  readModelInputObservations,
  unavailableModelInputObservations,
} from "./model-input-observations";
import { readHeadlessModelUsage } from "./model-usage";
import {
  createOperationalFailureTracker,
  emitOperationalFailure,
  type OperationalFailureSink,
  type OperationalFailureTracker,
} from "./operational-failure";
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
  pinResearchDataRoot,
  type ResearchGrounding,
  readResearchGrounding,
  unavailableResearchGrounding,
} from "./research-grounding";
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
  /** Trusted promptly-returning volatile sink. Never persisted or awaited. */
  onOperationalFailure?: OperationalFailureSink;
  repoRoot?: string;
  reportDir?: string;
  routeLabel?: string;
  enableConfiguredCloudResearch?: boolean;
  /** Explicitly opts this run into planner duplicate-alias suppression. */
  deduplicatePlannerAliasTools?: boolean;
  showResponses?: boolean;
  /** Diagnostic observers must return promptly. Async completion is not awaited. */
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
  recordActionDiagnostics?: boolean;
  /** Trusted synchronous writer seam: must return promptly. A hanging callback
   * cannot be interrupted; throwing is isolated from grading/cleanup. */
  writeActionDiagnosticsReceipt?: (path: string, bytes: string) => void;
  /** Explicit opt-in; inherited observer flags are shadowed in every child. */
  recordModelInputs?: boolean;
  /** Trusted promptly-returning synchronous writer; async completion is unsupported and not awaited. */
  writeModelInputReceipt?: (path: string, bytes: string) => void;
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

function ownedDirectory(
  path: string,
  failure?: OperationalFailureTracker,
): OwnedDirectory {
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
    failure?.refuseIdentity();
    // Keep private directory paths out of safety-abort diagnostics.
    throw new Error("Headless owned directory is not an ordinary directory.");
  }
}

function verifyOwnedDirectory(
  owned: OwnedDirectory,
  failure?: OperationalFailureTracker,
): void {
  const current = ownedDirectory(owned.path, failure);
  if (
    current.canonical !== owned.canonical ||
    current.dev !== owned.dev ||
    current.ino !== owned.ino
  ) {
    failure?.refuseIdentity();
    throw new Error("Refusing to remove a substituted headless directory.");
  }
}

function verifyOwnedTaskRoot(
  runRoot: OwnedDirectory,
  taskRoot: OwnedDirectory,
  failure?: OperationalFailureTracker,
): void {
  verifyOwnedDirectory(runRoot, failure);
  verifyOwnedDirectory(taskRoot, failure);
  const taskId = basename(taskRoot.path);
  if (
    dirname(runRoot.canonical) !== realpathSync(tmpdir()) ||
    !basename(runRoot.canonical).startsWith("doolittle-headless-eval-") ||
    dirname(taskRoot.canonical) !== runRoot.canonical ||
    !isSafeTaskId(taskId) ||
    taskRoot.path !== join(runRoot.path, taskId)
  ) {
    failure?.refuseIdentity();
    throw new Error(
      "Refusing to remove a task root outside the owned run root.",
    );
  }
}

function removeOwnedTaskRoot(
  runRoot: OwnedDirectory,
  taskRoot: OwnedDirectory,
  failure?: OperationalFailureTracker,
): void {
  verifyOwnedTaskRoot(runRoot, taskRoot, failure);
  rmSync(taskRoot.path, { recursive: true, force: false });
}

function verifyEmptyRunRoot(
  runRoot: OwnedDirectory,
  failure?: OperationalFailureTracker,
): void {
  verifyOwnedDirectory(runRoot, failure);
  if (readdirSync(runRoot.path).length !== 0) {
    failure?.refuseIdentity();
    throw new Error(
      "Headless run root contains unowned entries; owned state was retained.",
    );
  }
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
) {
  const failure = createOperationalFailureTracker();
  try {
    return await runHeadlessEvalSuiteAttempt(suite, options, failure);
  } catch (error) {
    emitOperationalFailure(options.onOperationalFailure, failure.receipt());
    throw error;
  }
}

async function runHeadlessEvalSuiteAttempt(
  suite: HeadlessEvalSuite,
  options: RunHeadlessEvalOptions,
  failure: OperationalFailureTracker,
): Promise<{
  report: HeadlessEvalReport;
  reportPath: string;
  exitCode: number;
  measurementReceiptStatus: "written" | "unavailable";
  actionDiagnosticsReceiptStatus: "disabled" | "written" | "unavailable";
  modelInputReceiptStatus: "disabled" | "written" | "unavailable";
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
    selectedTasks.some((task) => task.groundingStrategy === "sdk-web-source-v1")
  ) {
    // Refuse before credential resolution, persistence allocation or dispatch.
    if (options.enableConfiguredCloudResearch) {
      throw new Error(
        "SDK-web research cannot enable configured Cloud research.",
      );
    }
    if (
      selectedTasks.some(
        (task) =>
          task.groundingStrategy === "sdk-web-source-v1" &&
          task.followUpPrompts?.length,
      )
    ) {
      throw new Error("SDK-web grounding supports one CLI invocation only.");
    }
  }
  if (
    selectedTasks.some(
      (task) =>
        task.groundingStrategy === "coding-original-verifier-v1" &&
        task.followUpPrompts?.length,
    )
  ) {
    throw new Error("Coding verification supports one CLI invocation only.");
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
  failure.enter("report-storage");
  // Refuse unsafe persistence before dispatching any provider-backed child.
  privateReportFilename("2000-01-01T00:00:00.000Z", suite.id, suite.version);
  const reportDirectory = preparePrivateReportDirectory(options.reportDir);
  failure.enter("runner-preflight");
  const sourceAtStart = readSourceIdentity(repoRoot);
  failure.setSource(sourceAtStart);
  const cloudResearchOptedIn = Boolean(
    options.enableConfiguredCloudResearch &&
      selectedTasks.some((task) => task.domain === "research"),
  );
  const cloudCredentials = cloudResearchOptedIn
    ? configuredElizaCloudCredentials()
    : undefined;
  // Canonicalize the newly owned root before constructing any child env: the
  // private observer deliberately refuses even system aliases such as /var.
  const runRoot = mkdtempSync(
    join(realpathSync(tmpdir()), "doolittle-headless-eval-"),
  );
  const runIdentity = ownedDirectory(runRoot, failure);
  const taskIdentities = new Map<string, OwnedDirectory>();
  const preflightMs = durationMs(suiteStartedAt, monotonicNow());
  let cleanupBlocked = false;
  let finalCleanupComplete = false;
  let childCleanupSafe = true;
  const runs: HeadlessEvalRunResult[] = [];
  const actionDiagnostics: Array<{
    reportRunIndex: number;
    outcomes: ActionOutcomes;
  }> = [];
  const modelInputDiagnostics: Array<{
    reportRunIndex: number;
    cliInvocations: number;
    observations: ModelInputObservations;
  }> = [];
  let cleanupDurationMs = 0;
  try {
    for (const task of selectedTasks) {
      failure.enter("task-setup");
      verifyEmptyRunRoot(runIdentity, failure);
      const taskSetupStartedAt = monotonicNow();
      const taskRoot = join(runRoot, task.id);
      const dataDir = join(taskRoot, "data");
      const workspaceDir = join(taskRoot, "workspace");
      mkdirSync(taskRoot, { mode: 0o700 });
      const taskIdentity = ownedDirectory(taskRoot, failure);
      taskIdentities.set(taskRoot, taskIdentity);
      mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      mkdirSync(workspaceDir, { recursive: true, mode: 0o700 });
      writeFileSync(join(dataDir, "onboarding.json"), "{}\n", {
        mode: 0o600,
      });
      const researchRoot =
        task.groundingStrategy === "sdk-web-source-v1"
          ? pinResearchDataRoot(dataDir)
          : undefined;
      const modelInputRoot = options.recordModelInputs
        ? pinModelInputDataRoot(dataDir)
        : undefined;
      let modelInputs = unavailableModelInputObservations();
      const taskSetupMs = durationMs(taskSetupStartedAt, monotonicNow());

      const startedAt = Date.now();
      const prompts = [task.prompt, ...(task.followUpPrompts ?? [])];
      const codingVerificationCollector =
        task.groundingStrategy === "coding-original-verifier-v1"
          ? createCodingVerificationCollector(task.prompt)
          : undefined;
      const sessionId =
        prompts.length > 1 ? `doolittle-eval:${randomUUID()}` : undefined;
      const responses: string[] = [];
      let researchStdout = "";
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
        failure.enter("task-setup");
        verifyOwnedTaskRoot(runIdentity, taskIdentity, failure);
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
        childEnvironment[MODEL_INPUT_FLAG] = options.recordModelInputs
          ? "true"
          : "false";
        childEnvironment[PLANNER_ALIAS_TOOL_DEDUPLICATION_FLAG] =
          options.deduplicatePlannerAliasTools ? "true" : "false";
        childEnvironment[CODING_VERIFICATION_FLAG] =
          task.groundingStrategy === "coding-original-verifier-v1"
            ? "true"
            : "false";
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
        failure.enter("child-execution");
        failure.beginChild();
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
            onStdoutChunk: (chunk) => {
              observeStdout(chunk);
              codingVerificationCollector?.onStdoutChunk(chunk);
            },
          },
        );
        failure.finishChild(child.cleanupSafe === true);
        failure.enter("response-processing");
        const execEndedAt = monotonicNow();
        const responseProcessingStartedAt = execEndedAt;
        childCleanupSafe = child.cleanupSafe === true;
        if (!childCleanupSafe) {
          cleanupBlocked = true;
          diagnosticFlags.add("headless-child-cleanup-unconfirmed");
        }
        if (options.recordModelInputs && index === 0) {
          try {
            if (!childCleanupSafe) throw new Error();
            verifyOwnedTaskRoot(runIdentity, taskIdentity);
            // Snapshot once, before shared-data follow-ups. New CLI runtimes
            // refuse the preexisting observer file; never adopt it as new input.
            // This optional read is included in responseProcessingMs.
            modelInputs = readModelInputObservations(modelInputRoot);
          } catch {
            modelInputs = unavailableModelInputObservations();
          }
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
        if (task.groundingStrategy === "sdk-web-source-v1")
          researchStdout = child.stdout ?? "";
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

      failure.enter("grading");
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
      if (options.recordActionDiagnostics && childCleanupSafe) {
        let outcomes: ActionOutcomes;
        try {
          verifyOwnedTaskRoot(runIdentity, taskIdentity);
          outcomes = readActionOutcomes(dataDir);
        } catch {
          outcomes = unavailableActionOutcomes();
          outcomes.status = "partial";
          outcomes.rejectedRecords = 1;
        }
        actionDiagnostics.push({ reportRunIndex: runs.length, outcomes });
      }
      if (options.recordModelInputs)
        modelInputDiagnostics.push({
          reportRunIndex: runs.length,
          cliInvocations: execInvocations,
          observations: modelInputs,
        });
      try {
        const pending = options.onActionLabels?.(
          task.id,
          readHeadlessActionLabelDiagnostic(dataDir),
        );
        if (pending !== undefined)
          void Promise.resolve(pending).catch(() => undefined);
      } catch {
        // Optional diagnostic observers must not change grading or cleanup.
      }
      const checkContext = {
        response,
        responses,
        workspaceDir,
        actionStarts:
          traceSummary.journalAvailable && !traceSummary.malformed
            ? traceSummary.actionStarts
            : null,
      };
      const codingVerification = codingVerificationCollector
        ? codingVerificationCollector.finish({
            response,
            executionConfirmed: completed,
            cleanupConfirmed: childCleanupSafe,
          })
        : undefined;
      if (codingVerification && codingVerification.status !== "verified") {
        diagnosticFlags.add(`coding-verification-${codingVerification.reason}`);
      }
      let researchGrounding: ResearchGrounding | undefined;
      if (task.groundingStrategy === "sdk-web-source-v1") {
        researchGrounding = unavailableResearchGrounding(
          "execution-unconfirmed",
        );
        // Required grading evidence, not optional telemetry: never read live or
        // substituted state, and never let missing evidence certify retrieval.
        if (completed && childCleanupSafe) {
          try {
            verifyOwnedTaskRoot(runIdentity, taskIdentity);
            researchGrounding = readResearchGrounding({
              root: researchRoot,
              stdout: researchStdout,
              response,
              executionConfirmed: true,
            });
          } catch {
            researchGrounding = unavailableResearchGrounding("unsafe-input");
          }
        }
        if (researchGrounding.searchOutputAtCap)
          diagnosticFlags.add("sdk-web-search-output-at-cap");
        switch (researchGrounding.citationClassification) {
          case "non-string":
            diagnosticFlags.add("sdk-web-citation-non-string");
            break;
          case "whitespace":
            diagnosticFlags.add("sdk-web-citation-whitespace");
            break;
          case "github-view":
            diagnosticFlags.add("sdk-web-citation-github-view");
            break;
          case "other-url":
            diagnosticFlags.add("sdk-web-citation-other-url");
            break;
          case "non-url":
            diagnosticFlags.add("sdk-web-citation-non-url");
            break;
        }
        if (researchGrounding.status !== "verified") {
          diagnosticFlags.add(`sdk-web-grounding-${researchGrounding.reason}`);
        }
      }
      const gradingContext = {
        ...checkContext,
        ...(researchGrounding ? { researchGrounding } : {}),
        ...(codingVerification ? { codingVerification } : {}),
      };
      const checks = task.checks.map((check) => ({
        id: check.id,
        passed: Boolean(check.evaluate(gradingContext)),
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
      failure.enter("task-cleanup");
      if (!childCleanupSafe) {
        failure.unconfirmedCleanup();
        throw new Error(
          "Headless child cleanup could not be confirmed; owned state was retained.",
        );
      }
      const cleanupStartedAt = monotonicNow();
      removeOwnedTaskRoot(runIdentity, taskIdentity, failure);
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
    failure.enter("report-preparation");
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

    if (options.recordActionDiagnostics)
      report.executionOverrides.push(
        "Action diagnostics enabled: grading includes a bounded journal-event projection; the separate action receipt does not identify distinct commands or causal failures.",
      );
    if (options.recordModelInputs)
      report.executionOverrides.push(
        "Model input observations enabled: response processing includes a bounded first-creating-runtime-only snapshot; shared-data follow-up CLI invocations are not newly measured. Phase remains unknown; not wire bytes, effective routes, worker inputs or full overhead.",
      );
    if (options.deduplicatePlannerAliasTools)
      report.executionOverrides.push(PLANNER_ALIAS_TOOL_DEDUPLICATION_OVERRIDE);
    const reportLeaf = privateReportFilename(
      createdAt,
      suite.id,
      suite.version,
    );
    const reportPath = privateReportPath(reportDirectory, reportLeaf);
    // Refuse persistence as well as deletion if the owned root was replaced
    // during callbacks/report preparation; never publish a shortened success.
    verifyEmptyRunRoot(runIdentity, failure);
    report.harnessTiming.reportPreparationMs = durationMs(
      reportPreparationStartedAt,
      monotonicNow(),
    );
    failure.enter("final-cleanup");
    const finalCleanupStartedAt = monotonicNow();
    verifyOwnedDirectory(runIdentity, failure);
    if (readdirSync(runRoot).length !== 0)
      throw new Error("Owned run root was not empty at final cleanup.");
    rmdirSync(runRoot);
    finalCleanupComplete = true;
    report.harnessTiming.finalCleanupMs = durationMs(
      finalCleanupStartedAt,
      monotonicNow(),
    );
    failure.enter("report-preparation");
    const serializationStartedAt = monotonicNow();
    const reportBytes = `${JSON.stringify(report, null, 2)}\n`;
    const serializationMs = durationMs(serializationStartedAt, monotonicNow());
    const persistenceStartedAt = monotonicNow();
    failure.enter("report-persistence");
    failure.setPersistence("failed");
    writePrivateReportFile(reportDirectory, reportLeaf, reportBytes);
    failure.setPersistence("written");
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
    let actionDiagnosticsReceiptStatus: "disabled" | "written" | "unavailable" =
      options.recordActionDiagnostics ? "unavailable" : "disabled";
    if (options.recordActionDiagnostics) {
      try {
        const actionReceiptLeaf = `${reportLeaf}.actions.json`;
        const actionReceiptBytes = `${JSON.stringify({
          schemaVersion: 1,
          provenance: "headless-action-diagnostics",
          reportSchemaVersion: report.schemaVersion,
          evaluatorVersion: report.evaluatorVersion,
          reportSha256: sha256(reportBytes),
          mode: "opt-in-action-diagnostics",
          runs: actionDiagnostics,
        })}\n`;
        verifyPrivateReportDirectory(reportDirectory);
        // Trusted injection seam; default persistence always uses descriptors.
        const pending = options.writeActionDiagnosticsReceipt
          ? options.writeActionDiagnosticsReceipt(
              privateReportPath(reportDirectory, actionReceiptLeaf),
              actionReceiptBytes,
            )
          : writePrivateReportFile(
              reportDirectory,
              actionReceiptLeaf,
              actionReceiptBytes,
            );
        // An async hook is unsupported: do not await a possibly never-settling
        // promise or claim a completed write. Observe late rejection safely.
        if (pending !== undefined) {
          void Promise.resolve(pending).catch(() => undefined);
          throw new Error("Unsupported asynchronous diagnostic writer.");
        }
        verifyPrivateReportDirectory(reportDirectory);
        actionDiagnosticsReceiptStatus = "written";
      } catch {
        /* Optional diagnostics must not corrupt grading or expose errors. */
      }
    }
    let modelInputReceiptStatus: "disabled" | "written" | "unavailable" =
      options.recordModelInputs ? "unavailable" : "disabled";
    if (options.recordModelInputs) {
      try {
        const leaf = `${reportLeaf}.model-inputs.json`;
        const bytes = `${JSON.stringify({ schemaVersion: 1, provenance: "headless-model-input-observations", reportSchemaVersion: report.schemaVersion, evaluatorVersion: report.evaluatorVersion, reportSha256: sha256(reportBytes), mode: "opt-in-model-input-observations", coverage: "first-creating-runtime-only", runs: modelInputDiagnostics })}\n`;
        verifyPrivateReportDirectory(reportDirectory);
        const pending = options.writeModelInputReceipt
          ? options.writeModelInputReceipt(
              privateReportPath(reportDirectory, leaf),
              bytes,
            )
          : writePrivateReportFile(reportDirectory, leaf, bytes);
        if (pending !== undefined) {
          void Promise.resolve(pending).catch(() => undefined);
          throw new Error("Unsupported asynchronous diagnostic writer.");
        }
        verifyPrivateReportDirectory(reportDirectory);
        modelInputReceiptStatus = "written";
      } catch {
        /* Optional observations cannot change grading or expose errors. */
      }
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
      actionDiagnosticsReceiptStatus,
      modelInputReceiptStatus,
    };
  } catch (error) {
    // A refused identity guard or thrown executor must never be followed by
    // an unguarded recursive finally deletion of possibly foreign/live state.
    cleanupBlocked = true;
    throw error;
  } finally {
    if (!finalCleanupComplete && !cleanupBlocked && childCleanupSafe) {
      failure.enter("final-cleanup");
      verifyOwnedDirectory(runIdentity, failure);
      for (const taskIdentity of taskIdentities.values())
        verifyOwnedTaskRoot(runIdentity, taskIdentity, failure);
      for (const taskIdentity of taskIdentities.values())
        removeOwnedTaskRoot(runIdentity, taskIdentity, failure);
      // Never recursively delete unexpected entries in the run root.
      if (readdirSync(runRoot).length === 0) rmdirSync(runRoot);
    }
  }
}
