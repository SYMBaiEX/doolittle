import { createHash } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import {
  CODING_VERIFICATION_ID,
  type CodingVerificationReason,
  type CodingVerificationReceipt,
  type CodingVerificationStatus,
} from "@doolittle/contracts";

export {
  CODING_VERIFICATION_COMMAND,
  CODING_VERIFICATION_ID,
  CODING_VERIFICATION_SUCCESS_MARKER,
} from "@doolittle/contracts";

export const CODING_VERIFICATION_FLAG = "DOOLITTLE_EVAL_CODING_VERIFICATION";
export const CODING_VERIFICATION_STREAM_BYTE_LIMIT = 10 * 1024 * 1024;
export const CODING_VERIFICATION_STREAM_LINE_BYTE_LIMIT = 262_144;
export const CODING_VERIFICATION_STREAM_EVENT_LIMIT = 2048;

export type CodingVerificationUnavailableReason =
  | CodingVerificationReason
  | "execution-unconfirmed"
  | "cleanup-unconfirmed"
  | "missing-input"
  | "invalid-input"
  | "truncated-input";

export interface CodingVerification {
  provenance: "original-cli-json-stream";
  status: CodingVerificationStatus;
  reason: CodingVerificationUnavailableReason;
  shellStarts: number;
  shellCompletions: number;
  verifierMatches: number;
}

type StreamEvent = Record<string, unknown>;
type Counts = Pick<
  CodingVerification,
  "shellStarts" | "shellCompletions" | "verifierMatches"
>;

const RECEIPT_KEYS = [
  "type",
  "timestamp",
  "verifier",
  "status",
  "reason",
  "shellStarts",
  "shellCompletions",
  "verifierMatches",
  "success",
  "exitCode",
  "timedOut",
  "truncated",
  "workdirMatches",
  "actionPairMatched",
];
const REASONS = new Set<CodingVerificationReason>([
  "verified",
  "verifier-failed",
  "marker-mismatch",
  "verifier-ambiguous",
  "identity-unavailable",
  "foreign-context",
]);
const STATUSES = new Set<CodingVerificationStatus>([
  "verified",
  "failed",
  "unavailable",
]);
function result(
  status: CodingVerificationStatus,
  reason: CodingVerificationUnavailableReason,
  counts: Counts = {
    shellStarts: 0,
    shellCompletions: 0,
    verifierMatches: 0,
  },
): CodingVerification {
  return {
    provenance: "original-cli-json-stream",
    status,
    reason,
    ...counts,
  };
}

export function unavailableCodingVerification(
  reason: CodingVerificationUnavailableReason,
): CodingVerification {
  return result("unavailable", reason);
}

function isRecord(value: unknown): value is StreamEvent {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: StreamEvent, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === keys.length &&
    actual.every((key, index) => key === [...keys].sort()[index])
  );
}

function timestamp(value: unknown): number | undefined {
  if (typeof value !== "string" || value.length > 64) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return undefined;
  return new Date(parsed).toISOString() === value ? parsed : undefined;
}

function boundedCount(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= CODING_VERIFICATION_STREAM_EVENT_LIMIT
  );
}

function validReceiptShape(event: StreamEvent): boolean {
  return (
    exactKeys(event, RECEIPT_KEYS) &&
    event.type === "coding-verification" &&
    event.verifier === CODING_VERIFICATION_ID &&
    typeof event.timestamp === "string" &&
    timestamp(event.timestamp) !== undefined &&
    STATUSES.has(event.status as CodingVerificationStatus) &&
    REASONS.has(event.reason as CodingVerificationReason) &&
    boundedCount(event.shellStarts) &&
    boundedCount(event.shellCompletions) &&
    boundedCount(event.verifierMatches) &&
    typeof event.success === "boolean" &&
    (event.exitCode === null || Number.isSafeInteger(event.exitCode)) &&
    (event.timedOut === null || typeof event.timedOut === "boolean") &&
    (event.truncated === null || typeof event.truncated === "boolean") &&
    typeof event.workdirMatches === "boolean" &&
    typeof event.actionPairMatched === "boolean"
  );
}

function positiveReceipt(receipt: CodingVerificationReceipt): boolean {
  return (
    receipt.status === "verified" &&
    receipt.reason === "verified" &&
    receipt.success === true &&
    receipt.exitCode === 0 &&
    receipt.timedOut === false &&
    receipt.truncated === false &&
    receipt.workdirMatches === true &&
    receipt.actionPairMatched === true &&
    receipt.verifierMatches === 1 &&
    receipt.shellStarts > 0 &&
    receipt.shellCompletions === receipt.shellStarts
  );
}

function projectReceipt(
  receipt: CodingVerificationReceipt,
): CodingVerification {
  const counts = {
    shellStarts: receipt.shellStarts,
    shellCompletions: receipt.shellCompletions,
    verifierMatches: receipt.verifierMatches,
  };
  if (receipt.status === "verified") {
    return positiveReceipt(receipt)
      ? result("verified", "verified", counts)
      : result("unavailable", "invalid-input", counts);
  }
  if (receipt.reason === "verified")
    return result("unavailable", "invalid-input", counts);
  return result(receipt.status, receipt.reason, counts);
}

function responseDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Consume only top-level typed CLI events as chunks arrive. The collector does
 * not retain stdout, prompts, result text, timestamps, IDs, or unknown fields.
 */
export function createCodingVerificationCollector(expectedPrompt: string): {
  onStdoutChunk(chunk: Buffer): void;
  finish(input: {
    response: string;
    executionConfirmed: boolean;
    cleanupConfirmed: boolean;
  }): CodingVerification;
} {
  const decoder = new StringDecoder("utf8");
  let totalBytes = 0;
  let buffered = "";
  let eventCount = 0;
  let invalidReason: CodingVerificationUnavailableReason | undefined;
  let startCount = 0;
  let receiptCount = 0;
  let resultCount = 0;
  let completedCount = 0;
  let receipt: CodingVerificationReceipt | undefined;
  let startAt: number | undefined;
  let receiptAt: number | undefined;
  let resultAt: number | undefined;
  let completedAt: number | undefined;
  let startMatchesPrompt = false;
  let resultTextDigest: string | undefined;
  let resultShouldContinue = false;

  const invalidate = (reason: CodingVerificationUnavailableReason) => {
    invalidReason ??= reason;
  };

  const acceptLine = (line: string) => {
    if (!line.trim() || invalidReason) return;
    eventCount++;
    if (eventCount > CODING_VERIFICATION_STREAM_EVENT_LIMIT) {
      invalidate("truncated-input");
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      // Nub startup banners are not JSON events. Missing required boundaries
      // still fail closed, and no text from the line is kept or returned.
      return;
    }
    if (!isRecord(value) || typeof value.type !== "string") return;

    if (completedCount > 0) {
      invalidate("invalid-input");
      return;
    }

    if (value.type === "start") {
      const at = timestamp(value.timestamp);
      if (
        startCount !== 0 ||
        !exactKeys(value, ["type", "timestamp", "sessionId", "command"]) ||
        at === undefined ||
        typeof value.sessionId !== "string" ||
        value.sessionId.length === 0 ||
        value.sessionId.length > 128 ||
        typeof value.command !== "string"
      ) {
        invalidate("identity-unavailable");
        return;
      }
      startCount++;
      startAt = at;
      startMatchesPrompt = value.command === expectedPrompt.trim();
      if (!startMatchesPrompt) invalidate("foreign-context");
      return;
    }

    if (value.type === "coding-verification") {
      if (startCount !== 1 || resultCount !== 0 || completedCount !== 0) {
        invalidate("identity-unavailable");
        return;
      }
      receiptCount++;
      if (receiptCount > 1) {
        invalidate("verifier-ambiguous");
        return;
      }
      if (!validReceiptShape(value)) {
        invalidate("invalid-input");
        return;
      }
      const at = timestamp(value.timestamp);
      if (at === undefined || (startAt !== undefined && at < startAt)) {
        invalidate("identity-unavailable");
        return;
      }
      receipt = value as unknown as CodingVerificationReceipt;
      receiptAt = at;
      return;
    }

    if (value.type === "result") {
      const at = timestamp(value.timestamp);
      if (
        startCount !== 1 ||
        receiptCount > 1 ||
        resultCount !== 0 ||
        !exactKeys(value, [
          "type",
          "timestamp",
          "text",
          "tone",
          "shouldExit",
        ]) ||
        at === undefined ||
        typeof value.text !== "string" ||
        Buffer.byteLength(value.text) >
          CODING_VERIFICATION_STREAM_LINE_BYTE_LIMIT ||
        !["info", "success", "warning", "error", "agent"].includes(
          String(value.tone),
        ) ||
        value.shouldExit !== false ||
        (receiptAt !== undefined && at < receiptAt)
      ) {
        invalidate("identity-unavailable");
        return;
      }
      resultCount++;
      resultAt = at;
      // Only the digest survives parsing; final text is never returned.
      resultTextDigest = responseDigest(value.text);
      resultShouldContinue = value.shouldExit === false;
      return;
    }

    if (value.type === "completed") {
      const at = timestamp(value.timestamp);
      const keys = Object.keys(value);
      if (
        startCount !== 1 ||
        receiptCount > 1 ||
        resultCount !== 1 ||
        completedCount !== 0 ||
        !(
          exactKeys(value, ["type", "timestamp", "status"]) ||
          exactKeys(value, ["type", "timestamp", "status", "elapsedMs"])
        ) ||
        (keys.includes("elapsedMs") &&
          (typeof value.elapsedMs !== "number" ||
            !Number.isFinite(value.elapsedMs) ||
            value.elapsedMs < 0)) ||
        value.status !== "completed" ||
        at === undefined ||
        (resultAt !== undefined && at < resultAt)
      ) {
        invalidate("identity-unavailable");
        return;
      }
      completedCount++;
      completedAt = at;
      return;
    }

    if (value.type === "error") {
      invalidate("identity-unavailable");
      return;
    }

    if (
      value.type !== "progress" &&
      value.type !== "notice" &&
      value.type !== "run"
    ) {
      invalidate("invalid-input");
    } else if (resultCount > 0) {
      invalidate("identity-unavailable");
    }
  };

  const onStdoutChunk = (chunk: Buffer) => {
    if (invalidReason) return;
    totalBytes += chunk.byteLength;
    if (totalBytes > CODING_VERIFICATION_STREAM_BYTE_LIMIT) {
      invalidate("truncated-input");
      buffered = "";
      return;
    }
    buffered += decoder.write(chunk);
    let newline = buffered.indexOf("\n");
    while (newline >= 0) {
      const line = buffered.slice(0, newline).replace(/\r$/u, "");
      buffered = buffered.slice(newline + 1);
      if (
        Buffer.byteLength(line) > CODING_VERIFICATION_STREAM_LINE_BYTE_LIMIT
      ) {
        invalidate("truncated-input");
        buffered = "";
        return;
      }
      acceptLine(line);
      newline = buffered.indexOf("\n");
    }
    if (
      Buffer.byteLength(buffered) > CODING_VERIFICATION_STREAM_LINE_BYTE_LIMIT
    ) {
      invalidate("truncated-input");
      buffered = "";
    }
  };

  const finish = (input: {
    response: string;
    executionConfirmed: boolean;
    cleanupConfirmed: boolean;
  }): CodingVerification => {
    if (!input.executionConfirmed)
      return unavailableCodingVerification("execution-unconfirmed");
    if (!input.cleanupConfirmed)
      return unavailableCodingVerification("cleanup-unconfirmed");
    if (invalidReason) return unavailableCodingVerification(invalidReason);

    const tail = decoder.end();
    if (tail) buffered += tail;
    if (buffered.trim())
      return unavailableCodingVerification("truncated-input");
    if (
      startCount !== 1 ||
      receiptCount !== 1 ||
      resultCount !== 1 ||
      completedCount !== 1 ||
      !startMatchesPrompt ||
      !resultShouldContinue ||
      !receipt ||
      startAt === undefined ||
      receiptAt === undefined ||
      resultAt === undefined ||
      completedAt === undefined ||
      receiptAt < startAt ||
      resultAt < receiptAt ||
      completedAt < resultAt
    ) {
      return unavailableCodingVerification(
        receiptCount > 1
          ? "verifier-ambiguous"
          : receiptCount === 0
            ? "missing-input"
            : "identity-unavailable",
      );
    }
    if (
      resultTextDigest === undefined ||
      resultTextDigest !== responseDigest(input.response)
    )
      return unavailableCodingVerification("identity-unavailable");
    return projectReceipt(receipt);
  };

  return {
    onStdoutChunk,
    finish,
  };
}
