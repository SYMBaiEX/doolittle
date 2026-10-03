import { createHash } from "node:crypto";
import { closeSync, existsSync, fstatSync, openSync, readSync } from "node:fs";
import { join } from "node:path";

const LIMIT = 128;
const BYTE_LIMIT = 262144;
const PROVIDERS = [
  "codex",
  "openai",
  "anthropic",
  "claude-code",
  "ollama",
  "elizacloud",
  "devin",
  "offline",
];
const EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
];
export const digest = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
export interface AdvertisedRoute {
  provider: string | null;
  modelSha256: string;
  reasoningEffort: string | null;
}
/** Configuration expectation only, not an observation of a model invocation. */
export function advertisedRoute(value: {
  provider: string;
  model: string;
  reasoningEffort: string;
}): AdvertisedRoute {
  return {
    provider: PROVIDERS.includes(value.provider) ? value.provider : null,
    modelSha256: digest(value.model),
    reasoningEffort: EFFORTS.includes(value.reasoningEffort)
      ? value.reasoningEffort
      : null,
  };
}
export interface RequestedRoute {
  subject: { kind: "parent-turn"; sha256: string };
  provider: string | null;
  modelSha256: string;
  /** Existing request journal does not emit effort. Never infer it from Settings. */
  reasoningEffort: null;
}
export interface RouteEvidence {
  provenance: "doolittle-model-request-journal";
  coverage: "parent-turn-requests-only";
  status:
    | "unavailable"
    | "requested-only"
    | "partial"
    | "mixed"
    | "conflicting";
  journalAvailable: boolean;
  accepted: number;
  rejected: number;
  truncated: boolean;
  requested: RequestedRoute[];
  effective: {
    status: "unavailable";
    provider: null;
    modelSha256: null;
    reasoningEffort: null;
  };
  worker: { status: "unavailable"; provenance: null };
}
export interface HarnessTiming {
  coverage: "direct-phases-only";
  preflightMs: number;
  reportPreparationMs: number;
  finalCleanupMs: number;
  /** Completed serialization/persistence are in the separate receipt, not this write. */
  serializationMs: null;
  persistenceMs: null;
  untimed: "inter-phase-bookkeeping-and-receipt-write";
}
export interface TaskHarnessTiming {
  coverage: "direct-phases-only";
  setupMs: number;
  responseProcessingMs: number;
  gradingMs: number;
  cleanupMs: number;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
const hash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const boundedText = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 160;
const count = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;
const duration = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const routeKey = (route: RequestedRoute): string =>
  JSON.stringify([route.provider, route.modelSha256]);
export function parseAdvertisedRoute(value: unknown): AdvertisedRoute {
  if (
    !record(value) ||
    !exact(value, ["provider", "modelSha256", "reasoningEffort"]) ||
    !(
      value.provider === null || PROVIDERS.includes(value.provider as string)
    ) ||
    !hash(value.modelSha256) ||
    !(
      value.reasoningEffort === null ||
      EFFORTS.includes(value.reasoningEffort as string)
    )
  )
    throw new Error("Invalid content-free advertised route.");
  // Canonical field order keeps archived JSON key order out of route equality.
  return {
    provider: value.provider as string | null,
    modelSha256: value.modelSha256,
    reasoningEffort: value.reasoningEffort as string | null,
  };
}

/** Projection only: raw prompt/response/config/account fields never leave this reader. */
export function readRequestedRouteEvidence(dataDir: string): RouteEvidence {
  const path = join(dataDir, "trajectories", "trajectory-events.jsonl");
  const output: RouteEvidence = {
    provenance: "doolittle-model-request-journal",
    coverage: "parent-turn-requests-only",
    status: "unavailable",
    journalAvailable: existsSync(path),
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
  if (!output.journalAvailable) return output;
  let stored: string;
  let fd: number | undefined;
  try {
    fd = openSync(path, "r");
    const size = fstatSync(fd).size;
    output.truncated = size > BYTE_LIMIT;
    const bytes = Buffer.alloc(Math.min(size, BYTE_LIMIT));
    let offset = 0;
    while (offset < bytes.length) {
      const read = readSync(fd, bytes, offset, bytes.length - offset, null);
      if (!read) break;
      offset += read;
    }
    stored = bytes.subarray(0, offset).toString("utf8");
    if (output.truncated)
      stored = stored.slice(0, stored.lastIndexOf("\n") + 1);
  } catch {
    output.rejected++;
    output.status = "partial";
    return output;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        output.rejected++;
      }
    }
  }
  const subjects = new Map<string, string>();
  let conflict = false;
  for (const line of stored.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      output.rejected++;
      continue;
    }
    if (
      !record(value) ||
      value.category !== "model" ||
      value.event !== "model.request"
    )
      continue;
    if (output.accepted >= LIMIT) {
      output.truncated = true;
      break;
    }
    if (
      !boundedText(value.runId) ||
      !boundedText(value.sessionId) ||
      !boundedText(value.roomId) ||
      !boundedText(value.model) ||
      !boundedText(value.provider)
    ) {
      output.rejected++;
      continue;
    }
    const step =
      record(value.metadata) && boundedText(value.metadata.trajectoryStepId)
        ? value.metadata.trajectoryStepId
        : null;
    const subject = digest(
      JSON.stringify([value.runId, value.sessionId, value.roomId, step]),
    );
    const route: RequestedRoute = {
      subject: { kind: "parent-turn", sha256: subject },
      provider: PROVIDERS.includes(value.provider) ? value.provider : null,
      modelSha256: digest(value.model),
      reasoningEffort: null,
    };
    const previous = subjects.get(subject);
    if (previous !== undefined && previous !== routeKey(route)) conflict = true;
    subjects.set(subject, routeKey(route));
    output.accepted++;
    output.requested.push(route);
  }
  output.status = evidenceStatus(output, conflict);
  return output;
}
function evidenceStatus(
  value: RouteEvidence,
  conflict: boolean,
): RouteEvidence["status"] {
  if (conflict) return "conflicting";
  if (new Set(value.requested.map(routeKey)).size > 1) return "mixed";
  if (
    value.rejected ||
    value.truncated ||
    value.requested.some((route) => route.provider === null)
  )
    return "partial";
  return value.accepted ? "requested-only" : "unavailable";
}
export function parseRouteEvidence(value: unknown): RouteEvidence {
  if (
    !record(value) ||
    !exact(value, [
      "provenance",
      "coverage",
      "status",
      "journalAvailable",
      "accepted",
      "rejected",
      "truncated",
      "requested",
      "effective",
      "worker",
    ]) ||
    value.provenance !== "doolittle-model-request-journal" ||
    value.coverage !== "parent-turn-requests-only" ||
    typeof value.journalAvailable !== "boolean" ||
    !count(value.accepted) ||
    value.accepted > LIMIT ||
    !count(value.rejected) ||
    typeof value.truncated !== "boolean" ||
    !Array.isArray(value.requested) ||
    value.requested.length !== value.accepted ||
    !record(value.effective) ||
    !exact(value.effective, [
      "status",
      "provider",
      "modelSha256",
      "reasoningEffort",
    ]) ||
    value.effective.status !== "unavailable" ||
    value.effective.provider !== null ||
    value.effective.modelSha256 !== null ||
    value.effective.reasoningEffort !== null ||
    !record(value.worker) ||
    !exact(value.worker, ["status", "provenance"]) ||
    value.worker.status !== "unavailable" ||
    value.worker.provenance !== null
  )
    throw new Error("Invalid content-free route evidence.");
  const subjects = new Map<string, string>();
  let conflicting = false;
  for (const entry of value.requested) {
    if (
      !record(entry) ||
      !exact(entry, [
        "subject",
        "provider",
        "modelSha256",
        "reasoningEffort",
      ]) ||
      !record(entry.subject) ||
      !exact(entry.subject, ["kind", "sha256"]) ||
      entry.subject.kind !== "parent-turn" ||
      !hash(entry.subject.sha256) ||
      !(
        entry.provider === null || PROVIDERS.includes(entry.provider as string)
      ) ||
      !hash(entry.modelSha256) ||
      entry.reasoningEffort !== null
    )
      throw new Error("Invalid requested route subject.");
    const key = routeKey(entry as unknown as RequestedRoute);
    if (
      subjects.has(entry.subject.sha256) &&
      subjects.get(entry.subject.sha256) !== key
    )
      conflicting = true;
    subjects.set(entry.subject.sha256, key);
  }
  const parsed = value as unknown as RouteEvidence;
  if (
    (!parsed.journalAvailable &&
      (parsed.accepted || parsed.rejected || parsed.truncated)) ||
    evidenceStatus(parsed, conflicting) !== parsed.status
  )
    throw new Error("Inconsistent route evidence coverage.");
  return parsed;
}
export function requestedSignature(value: RouteEvidence): string {
  return JSON.stringify({
    status: value.status,
    routes: [...new Set(value.requested.map(routeKey))].sort(),
  });
}
export function parseHarnessTiming(value: unknown): HarnessTiming {
  if (
    !record(value) ||
    !exact(value, [
      "coverage",
      "preflightMs",
      "reportPreparationMs",
      "finalCleanupMs",
      "serializationMs",
      "persistenceMs",
      "untimed",
    ]) ||
    value.coverage !== "direct-phases-only" ||
    !duration(value.preflightMs) ||
    !duration(value.reportPreparationMs) ||
    !duration(value.finalCleanupMs) ||
    value.serializationMs !== null ||
    value.persistenceMs !== null ||
    value.untimed !== "inter-phase-bookkeeping-and-receipt-write"
  )
    throw new Error("Invalid harness phase coverage.");
  return value as unknown as HarnessTiming;
}
export function parseTaskHarnessTiming(value: unknown): TaskHarnessTiming {
  if (
    !record(value) ||
    !exact(value, [
      "coverage",
      "setupMs",
      "responseProcessingMs",
      "gradingMs",
      "cleanupMs",
    ]) ||
    value.coverage !== "direct-phases-only" ||
    ![
      value.setupMs,
      value.responseProcessingMs,
      value.gradingMs,
      value.cleanupMs,
    ].every(duration)
  )
    throw new Error("Invalid task phase coverage.");
  return value as unknown as TaskHarnessTiming;
}
