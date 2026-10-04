import { performance } from "node:perf_hooks";

export const OPERATIONAL_FAILURE_PREFIX = "HEADLESS_OPERATIONAL_FAILURE ";
export const OPERATIONAL_PHASES = [
  "cli-preflight",
  "runner-preflight",
  "report-storage",
  "task-setup",
  "child-execution",
  "response-processing",
  "grading",
  "task-cleanup",
  "report-preparation",
  "final-cleanup",
  "report-persistence",
  "cli-output",
] as const;
export const OPERATIONAL_CODES = [
  "cli-preflight-failed",
  "runner-preflight-failed",
  "report-storage-refused",
  "task-setup-failed",
  "executor-threw",
  "response-processing-failed",
  "grading-failed",
  "task-cleanup-failed",
  "report-preparation-failed",
  "final-cleanup-failed",
  "report-persistence-failed",
  "cli-output-failed",
  "child-cleanup-unconfirmed",
  "owned-directory-refused",
] as const;
export type OperationalPhase = (typeof OPERATIONAL_PHASES)[number];
export type OperationalCode = (typeof OPERATIONAL_CODES)[number];
export interface HeadlessOperationalFailure {
  readonly contract: "operational-failure-v1";
  readonly eligibleForEvaluationComparison: false;
  readonly phase: OperationalPhase;
  /** Authored control-flow category, never a decoded exception or inferred cause. */
  readonly code: OperationalCode;
  readonly timing: {
    readonly elapsedMs: number | null;
    readonly phaseElapsedMs: number | null;
    /** Last attempted child invocation only, not aggregate child/model time. */
    readonly childElapsedMs: number | null;
  };
  readonly childCleanup:
    | "not-started"
    | "confirmed"
    | "unconfirmed"
    | "unknown";
  /** No earlier successful probe is promoted to current identity attestation. */
  readonly ownedDirectoryIdentity: "unknown" | "refused";
  /** Primary write-contract outcome, not proof that an artifact is absent. */
  readonly persistence: "not-attempted" | "failed" | "written" | "unknown";
  readonly source: {
    readonly revision: string | null;
    readonly workingTreeClean: boolean | null;
    readonly attestation: "start-snapshot-only" | "unavailable";
  };
}
export type OperationalFailureSink = (
  receipt: HeadlessOperationalFailure,
) => void;

const PHASE_CODE: Record<OperationalPhase, OperationalCode> = {
  "cli-preflight": "cli-preflight-failed",
  "runner-preflight": "runner-preflight-failed",
  "report-storage": "report-storage-refused",
  "task-setup": "task-setup-failed",
  "child-execution": "executor-threw",
  "response-processing": "response-processing-failed",
  grading: "grading-failed",
  "task-cleanup": "task-cleanup-failed",
  "report-preparation": "report-preparation-failed",
  "final-cleanup": "final-cleanup-failed",
  "report-persistence": "report-persistence-failed",
  "cli-output": "cli-output-failed",
};

function compatiblePhaseAndCode(phase: unknown, code: unknown): boolean {
  return OPERATIONAL_PHASES.some(
    (knownPhase) =>
      phase === knownPhase &&
      (code === PHASE_CODE[knownPhase] ||
        (code === "child-cleanup-unconfirmed" &&
          knownPhase === "task-cleanup") ||
        (code === "owned-directory-refused" &&
          [
            "runner-preflight",
            "task-setup",
            "task-cleanup",
            "report-preparation",
            "final-cleanup",
          ].includes(knownPhase))),
  );
}

function closedRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))
  )
    return undefined;
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor)) return undefined;
    result[key] = descriptor.value;
  }
  return result;
}
const duration = (value: unknown) =>
  value === null ||
  (typeof value === "number" && Number.isFinite(value) && value >= 0);

function projectOperationalFailure(
  value: unknown,
): HeadlessOperationalFailure | undefined {
  try {
    const record = closedRecord(value, [
      "contract",
      "eligibleForEvaluationComparison",
      "phase",
      "code",
      "timing",
      "childCleanup",
      "ownedDirectoryIdentity",
      "persistence",
      "source",
    ]);
    if (!record) return undefined;
    const timing = closedRecord(record.timing, [
      "elapsedMs",
      "phaseElapsedMs",
      "childElapsedMs",
    ]);
    const source = closedRecord(record.source, [
      "revision",
      "workingTreeClean",
      "attestation",
    ]);
    const valid =
      record.contract === "operational-failure-v1" &&
      record.eligibleForEvaluationComparison === false &&
      compatiblePhaseAndCode(record.phase, record.code) &&
      Boolean(timing && Object.values(timing).every(duration)) &&
      typeof record.childCleanup === "string" &&
      ["not-started", "confirmed", "unconfirmed", "unknown"].includes(
        record.childCleanup,
      ) &&
      typeof record.ownedDirectoryIdentity === "string" &&
      ["unknown", "refused"].includes(record.ownedDirectoryIdentity) &&
      typeof record.persistence === "string" &&
      ["not-attempted", "failed", "written", "unknown"].includes(
        record.persistence,
      ) &&
      Boolean(
        source &&
          (source.revision === null ||
            (typeof source.revision === "string" &&
              /^[a-f0-9]{40}$/u.test(source.revision))) &&
          (source.workingTreeClean === null ||
            typeof source.workingTreeClean === "boolean") &&
          (source.attestation === "unavailable" ||
            source.attestation === "start-snapshot-only"),
      );
    if (!valid || !timing || !source) return undefined;
    // Null-prototype copies cannot invoke caller toJSON hooks during encoding.
    return Object.assign(Object.create(null), {
      contract: "operational-failure-v1",
      eligibleForEvaluationComparison: false,
      phase: record.phase,
      code: record.code,
      timing: Object.assign(Object.create(null), {
        elapsedMs: timing.elapsedMs,
        phaseElapsedMs: timing.phaseElapsedMs,
        childElapsedMs: timing.childElapsedMs,
      }),
      childCleanup: record.childCleanup,
      ownedDirectoryIdentity: record.ownedDirectoryIdentity,
      persistence: record.persistence,
      source: Object.assign(Object.create(null), {
        revision: source.revision,
        workingTreeClean: source.workingTreeClean,
        attestation: source.attestation,
      }),
    }) as HeadlessOperationalFailure;
  } catch {
    return undefined;
  }
}

export function isHeadlessOperationalFailure(
  value: unknown,
): value is HeadlessOperationalFailure {
  return projectOperationalFailure(value) !== undefined;
}

export function formatOperationalFailure(
  receipt: HeadlessOperationalFailure,
): string {
  const projected = projectOperationalFailure(receipt);
  if (!projected)
    throw new Error("Invalid closed operational failure receipt.");
  return `${OPERATIONAL_FAILURE_PREFIX}${JSON.stringify(projected)}`;
}

/** Trusted sinks must return promptly; async completion is not awaited. */
export function emitOperationalFailure(
  sink: OperationalFailureSink | undefined,
  receipt: HeadlessOperationalFailure,
): void {
  try {
    const pending: unknown = sink?.(receipt);
    if (pending !== undefined)
      void Promise.resolve(pending).catch(() => undefined);
  } catch {
    /* A diagnostic sink must not change failure or cleanup behavior. */
  }
}

export function createOperationalFailureTracker(
  initialPhase: OperationalPhase = "runner-preflight",
  clock: () => number = () => performance.now(),
) {
  const readClock = () => {
    try {
      const value = clock();
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  };
  const startedAt = readClock();
  let phase = initialPhase;
  let code = PHASE_CODE[phase];
  let phaseStartedAt = startedAt;
  let childStartedAt: number | null = null;
  let childElapsedMs: number | null = null;
  let childCleanup: HeadlessOperationalFailure["childCleanup"] = "not-started";
  let ownedDirectoryIdentity: HeadlessOperationalFailure["ownedDirectoryIdentity"] =
    "unknown";
  let persistence: HeadlessOperationalFailure["persistence"] = "not-attempted";
  let source: HeadlessOperationalFailure["source"] = {
    revision: null,
    workingTreeClean: null,
    attestation: "unavailable",
  };
  const elapsed = (start: number | null, end: number | null) => {
    if (start === null || end === null) return null;
    const difference = end - start;
    return Number.isFinite(difference) && difference >= 0
      ? Math.round(difference)
      : null;
  };
  return {
    enter(next: OperationalPhase) {
      phase = next;
      code = PHASE_CODE[next];
      phaseStartedAt = readClock();
    },
    refuseIdentity() {
      ownedDirectoryIdentity = "refused";
      code = "owned-directory-refused";
    },
    setSource(snapshot: {
      revision: string | null;
      workingTreeClean: boolean | null;
    }) {
      source = {
        revision:
          snapshot.revision && /^[a-f0-9]{40}$/iu.test(snapshot.revision)
            ? snapshot.revision.toLowerCase()
            : null,
        workingTreeClean: snapshot.workingTreeClean,
        attestation: "start-snapshot-only",
      };
    },
    beginChild() {
      childStartedAt = readClock();
      childElapsedMs = null;
      childCleanup = "unknown";
    },
    unavailableChild() {
      childStartedAt = null;
      childElapsedMs = null;
      childCleanup = "unknown";
    },
    finishChild(confirmed: boolean) {
      childElapsedMs = elapsed(childStartedAt, readClock());
      childStartedAt = null;
      childCleanup = confirmed ? "confirmed" : "unconfirmed";
    },
    unconfirmedCleanup() {
      code = "child-cleanup-unconfirmed";
    },
    setPersistence(next: HeadlessOperationalFailure["persistence"]) {
      persistence = next;
    },
    receipt(): HeadlessOperationalFailure {
      const endedAt = readClock();
      return Object.freeze({
        contract: "operational-failure-v1",
        eligibleForEvaluationComparison: false,
        phase,
        code,
        timing: Object.freeze({
          elapsedMs: elapsed(startedAt, endedAt),
          phaseElapsedMs: elapsed(phaseStartedAt, endedAt),
          childElapsedMs:
            childStartedAt === null
              ? childElapsedMs
              : elapsed(childStartedAt, endedAt),
        }),
        childCleanup,
        ownedDirectoryIdentity,
        persistence,
        source: Object.freeze({ ...source }),
      });
    },
  };
}
export type OperationalFailureTracker = ReturnType<
  typeof createOperationalFailureTracker
>;
