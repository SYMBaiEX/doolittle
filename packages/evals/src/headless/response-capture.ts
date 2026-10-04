import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { basename, dirname } from "node:path";
import { findHeadlessEvalSuite } from "./cases";
import { validateHeadlessEvalReport } from "./compare";
import {
  preparePrivateReportDirectory,
  privateReportPath,
  verifyPrivateReportDirectory,
  writePrivateReportFile,
} from "./private-report";
import {
  type HeadlessEvalReport,
  type RunHeadlessEvalOptions,
  runHeadlessEvalSuite,
} from "./runner";

export const SYNTHETIC_RESPONSE_TURN_BYTE_LIMIT = 8 * 1024;
export const SYNTHETIC_RESPONSE_TOTAL_BYTE_LIMIT = 64 * 1024;
const REPORT_BYTE_LIMIT = 2 * 1024 * 1024;
const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

export type ResponseCaptureReason =
  | "invalid-observation"
  | "response-cap"
  | "incomplete"
  | "binding-mismatch"
  | "execution-incomplete"
  | "unsafe-report"
  | "discarded";

/** Intentionally contains bounded synthetic responses. Never part of a report,
 * journal, telemetry, or ordinary CLI output. Not a human rating or tool trace.
 */
export interface SyntheticResponseManifest {
  schemaVersion: 1;
  provenance: "prospective-headless-response-callback";
  coverage: "final-responses-only";
  reportSha256: string;
  suite: { id: string; version: number };
  tasks: Array<{
    taskId: string;
    turns: Array<{ turn: number; sha256: string; response: string }>;
  }>;
}

export type ResponseCaptureResult =
  | {
      status: "written";
      reportSha256: string;
      path: string;
      tasks: number;
      turns: number;
    }
  | { status: "unavailable"; reason: ResponseCaptureReason };

/**
 * Explicit opt-in for code-defined public synthetic suites only. The observer
 * is synchronous, bounded and non-throwing. Bytes stay volatile until the
 * caller supplies the original successful runner return and persisted report.
 * A thrown runner must call discard(); failed-but-reported objective checks
 * remain eligible, while incomplete execution does not get a review capture.
 * Private storage assumes quiescent owned directories and trusted same-UID
 * code, not an OS sandbox or a tamper-proof provenance boundary. This low-level
 * adapter checks content/report binding, not a unique originating invocation:
 * another same-task report with identical responses can satisfy that binding.
 * Use runSyntheticReviewEval for the direct original-run closure association.
 */
export function createSyntheticResponseCapture(input: {
  suiteId: string;
  taskIds?: readonly string[];
}): {
  observe(
    taskId: string,
    response: string,
    turnNumber: number,
    turnTotal: number,
  ): void;
  commit(input: {
    report: HeadlessEvalReport;
    reportPath: string;
  }): ResponseCaptureResult;
  discard(): void;
} {
  const suite = findHeadlessEvalSuite(input.suiteId);
  if (
    !suite ||
    input.taskIds?.some((id) => !suite.tasks.some((task) => task.id === id)) ||
    (input.taskIds && new Set(input.taskIds).size !== input.taskIds.length)
  )
    throw new Error("Unknown synthetic review task selection.");
  const tasks = suite.tasks.filter(
    (task) => !input.taskIds?.length || input.taskIds.includes(task.id),
  );
  if (!tasks.length || tasks.some((task) => !task.humanReviewRequired))
    throw new Error("Synthetic review requires human-review tasks.");
  // Snapshot the declared turn/check identities before any provider launch.
  const expected = tasks.map((task) => ({
    id: task.id,
    turns: 1 + (task.followUpPrompts?.length ?? 0),
    checks: task.checks.map((check) => check.id),
  }));
  const suiteIdentity = { id: suite.id, version: suite.version };
  const observed: SyntheticResponseManifest["tasks"] = expected.map((task) => ({
    taskId: task.id,
    turns: [],
  }));
  let taskIndex = 0;
  let totalBytes = 0;
  let reason: ResponseCaptureReason | undefined;
  let consumed = false;
  const clear = () => {
    for (const task of observed) task.turns.length = 0;
    totalBytes = 0;
  };
  const refuse = (failure: ResponseCaptureReason) => {
    reason ??= failure;
    clear();
  };
  return {
    observe(taskId, response, turnNumber, turnTotal) {
      if (consumed || reason) return;
      const task = expected[taskIndex];
      const row = observed[taskIndex];
      if (
        !task ||
        !row ||
        taskId !== task.id ||
        turnTotal !== task.turns ||
        turnNumber !== row.turns.length + 1 ||
        typeof response !== "string"
      ) {
        refuse("invalid-observation");
        return;
      }
      // UTF-8 bytes are never fewer than UTF-16 code units. Reject oversized
      // inputs in O(1) before trim/encoding/hash scans, not after scanning them.
      if (
        response.length > SYNTHETIC_RESPONSE_TURN_BYTE_LIMIT ||
        response.length > SYNTHETIC_RESPONSE_TOTAL_BYTE_LIMIT - totalBytes
      ) {
        refuse("response-cap");
        return;
      }
      if (!response.trim()) {
        refuse("invalid-observation");
        return;
      }
      const bytes = Buffer.byteLength(response, "utf8");
      if (
        bytes > SYNTHETIC_RESPONSE_TURN_BYTE_LIMIT ||
        totalBytes + bytes > SYNTHETIC_RESPONSE_TOTAL_BYTE_LIMIT
      ) {
        refuse("response-cap");
        return;
      }
      totalBytes += bytes;
      row.turns.push({ turn: turnNumber, sha256: digest(response), response });
      if (turnNumber === task.turns) taskIndex++;
    },
    commit({ report, reportPath }) {
      if (consumed) return { status: "unavailable", reason: "discarded" };
      consumed = true;
      let fd: number | undefined;
      let failure: ResponseCaptureReason = reason ?? "unsafe-report";
      try {
        if (reason) throw new Error();
        if (taskIndex !== expected.length) {
          failure = "incomplete";
          throw new Error();
        }
        const directory = preparePrivateReportDirectory(dirname(reportPath));
        verifyPrivateReportDirectory(directory);
        const path = privateReportPath(directory, basename(reportPath));
        if (!process.getuid || !constants.O_NOFOLLOW || !constants.O_NONBLOCK)
          throw new Error();
        fd = openSync(
          path,
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
        const before = fstatSync(fd, { bigint: true });
        if (
          !before.isFile() ||
          before.uid !== BigInt(process.getuid()) ||
          (before.mode & 0o777n) !== 0o600n ||
          before.nlink !== 1n ||
          before.size > BigInt(REPORT_BYTE_LIMIT)
        )
          throw new Error();
        const buffer = Buffer.alloc(
          Math.min(Number(before.size) + 1, REPORT_BYTE_LIMIT + 1),
        );
        let bytesRead = 0;
        while (bytesRead < buffer.length) {
          const count = readSync(
            fd,
            buffer,
            bytesRead,
            buffer.length - bytesRead,
            bytesRead,
          );
          if (count === 0) break;
          bytesRead += count;
        }
        const bytes = buffer.subarray(0, bytesRead);
        const after = fstatSync(fd, { bigint: true });
        verifyPrivateReportDirectory(directory);
        if (
          BigInt(bytes.length) !== before.size ||
          before.size !== after.size ||
          before.mtimeNs !== after.mtimeNs ||
          before.ctimeNs !== after.ctimeNs
        )
          throw new Error();
        failure = "binding-mismatch";
        if (!bytes.equals(Buffer.from(`${JSON.stringify(report, null, 2)}\n`)))
          throw new Error();
        validateHeadlessEvalReport(report);
        if (
          report.schemaVersion !== 5 ||
          report.suite.id !== suiteIdentity.id ||
          report.suite.version !== suiteIdentity.version ||
          report.runs.length !== expected.length
        )
          throw new Error();
        for (const [index, task] of expected.entries()) {
          const run = report.runs[index];
          const row = observed[index];
          if (run.status !== "completed") {
            failure = "execution-incomplete";
            throw new Error();
          }
          if (
            run.taskId !== task.id ||
            run.timing.execInvocations !== task.turns ||
            !run.humanReviewRequired ||
            JSON.stringify(run.checks.map((check) => check.id)) !==
              JSON.stringify(task.checks) ||
            JSON.stringify(run.responseSha256s) !==
              JSON.stringify(row.turns.map((turn) => turn.sha256))
          )
            throw new Error();
        }
        const reportSha256 = digest(bytes);
        const manifest: SyntheticResponseManifest = {
          schemaVersion: 1,
          provenance: "prospective-headless-response-callback",
          coverage: "final-responses-only",
          reportSha256,
          suite: suiteIdentity,
          tasks: observed,
        };
        closeSync(fd);
        fd = undefined;
        failure = "unsafe-report";
        const leaf = `${basename(reportPath)}.responses.json`;
        writePrivateReportFile(
          directory,
          leaf,
          `${JSON.stringify(manifest)}\n`,
        );
        return {
          status: "written",
          reportSha256,
          path: privateReportPath(directory, leaf),
          tasks: observed.length,
          turns: expected.reduce((count, task) => count + task.turns, 0),
        };
      } catch {
        return { status: "unavailable", reason: failure };
      } finally {
        try {
          if (fd !== undefined) closeSync(fd);
        } catch {
          // Cleanup of a read-only descriptor must not replace the refusal.
        }
        clear();
      }
    },
    discard() {
      consumed = true;
      reason = "discarded";
      clear();
    },
  };
}

/** Explicit programmatic review path. Never prints raw responses, and accepts
 * only the registry's code-defined synthetic tasks. Predeclare the source,
 * selected tasks, repetitions and resource bounds separately before calling.
 * This does not attest an effective provider/account route or human review.
 */
export async function runSyntheticReviewEval(
  suiteId: string,
  options: Omit<
    RunHeadlessEvalOptions,
    "onResponse" | "showResponses" | "responseObserverMode"
  > = {},
): Promise<
  Awaited<ReturnType<typeof runHeadlessEvalSuite>> & {
    responseCapture: ResponseCaptureResult;
  }
> {
  const capture = createSyntheticResponseCapture({
    suiteId,
    taskIds: options.taskIds,
  });
  const suite = findHeadlessEvalSuite(suiteId);
  if (!suite) throw new Error("Unknown synthetic evaluation suite.");
  try {
    const result = await runHeadlessEvalSuite(suite, {
      ...options,
      showResponses: true,
      responseObserverMode: "synthetic-review-capture-v1",
      onResponse: capture.observe,
    });
    return { ...result, responseCapture: capture.commit(result) };
  } catch (error) {
    capture.discard();
    throw error;
  }
}
