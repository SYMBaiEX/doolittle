import { describe, expect, it, vi } from "vitest";
import { validateHeadlessEvalReport } from "./compare";
import {
  createOperationalFailureTracker,
  emitOperationalFailure,
  formatOperationalFailure,
  type HeadlessOperationalFailure,
  isHeadlessOperationalFailure,
  OPERATIONAL_FAILURE_PREFIX,
} from "./operational-failure";

const receipt = () =>
  createOperationalFailureTracker("runner-preflight", () => 10).receipt();

describe("closed volatile operational failure contract", () => {
  it("contains closed metadata only and is explicitly ineligible for evaluation comparison", () => {
    const value = receipt();
    expect(isHeadlessOperationalFailure(value)).toBe(true);
    expect(value.eligibleForEvaluationComparison).toBe(false);
    expect(value.childCleanup).toBe("not-started");
    expect(value.ownedDirectoryIdentity).toBe("unknown");
    const line = formatOperationalFailure(value);
    expect(line.startsWith(OPERATIONAL_FAILURE_PREFIX)).toBe(true);
    expect(line.length).toBeLessThan(1_000);
    expect(JSON.parse(line.slice(OPERATIONAL_FAILURE_PREFIX.length))).toEqual(
      value,
    );
    expect(Object.isFrozen(value)).toBe(true);
    expect(() => validateHeadlessEvalReport(value)).toThrow();
    expect(() =>
      validateHeadlessEvalReport(
        JSON.parse(line.slice(OPERATIONAL_FAILURE_PREFIX.length)),
      ),
    ).toThrow();
  });

  it("measures the last attempted child, never the aggregate or a timeout inference", () => {
    let clock = 0;
    const tracker = createOperationalFailureTracker(
      "runner-preflight",
      () => clock,
    );
    tracker.enter("child-execution");
    tracker.beginChild();
    clock = 100;
    tracker.finishChild(true);
    clock = 120;
    tracker.beginChild();
    clock = 125;
    expect(tracker.receipt()).toMatchObject({
      code: "executor-threw",
      childCleanup: "unknown",
      timing: { childElapsedMs: 5 },
    });
    tracker.finishChild(false);
    tracker.enter("task-cleanup");
    tracker.unconfirmedCleanup();
    expect(tracker.receipt()).toMatchObject({
      code: "child-cleanup-unconfirmed",
      childCleanup: "unconfirmed",
      timing: { childElapsedMs: 5 },
    });
  });

  it("labels source as a start snapshot and never asserts current directory identity", () => {
    const tracker = createOperationalFailureTracker();
    tracker.setSource({ revision: "a".repeat(40), workingTreeClean: true });
    tracker.refuseIdentity();
    expect(tracker.receipt()).toMatchObject({
      ownedDirectoryIdentity: "refused",
      source: {
        attestation: "start-snapshot-only",
        revision: "a".repeat(40),
        workingTreeClean: true,
      },
    });
  });

  it.each([NaN, Infinity, -1, "PRIVATE_TIMING_CANARY"])(
    "rejects invalid timing metadata: %s",
    (value) => {
      const input = {
        ...receipt(),
        timing: { ...receipt().timing, elapsedMs: value },
      };
      expect(isHeadlessOperationalFailure(input)).toBe(false);
      expect(() =>
        formatOperationalFailure(input as HeadlessOperationalFailure),
      ).toThrow("Invalid closed operational failure receipt.");
    },
  );

  it.each([
    { unexpected: "PRIVATE_UNKNOWN_CANARY" },
    { code: "PRIVATE_CODE_CANARY" },
    { phase: "PRIVATE_PHASE_CANARY" },
    { persistence: "PRIVATE_PERSISTENCE_CANARY" },
    { eligibleForEvaluationComparison: true },
    { source: { ...receipt().source, revision: "PRIVATE_REVISION_CANARY" } },
  ])("rejects unknown fields or unsupported primitive values", (overrides) => {
    expect(isHeadlessOperationalFailure({ ...receipt(), ...overrides })).toBe(
      false,
    );
  });

  it("never coerces hostile enum objects or invokes inherited/own encoding hooks", () => {
    const enumCoercion = vi.fn(() => "confirmed");
    expect(
      isHeadlessOperationalFailure({
        ...receipt(),
        childCleanup: { toString: enumCoercion },
      }),
    ).toBe(false);
    expect(enumCoercion).not.toHaveBeenCalled();
    const toJSON = vi.fn(() => "PRIVATE_ENCODING_CANARY");
    for (const input of [
      Object.assign(Object.create({ toJSON }), receipt()),
      { ...receipt(), toJSON },
    ]) {
      expect(isHeadlessOperationalFailure(input)).toBe(false);
      expect(() => formatOperationalFailure(input)).toThrow(
        "Invalid closed operational failure receipt.",
      );
    }
    expect(toJSON).not.toHaveBeenCalled();
  });

  it.each([
    { phase: "grading", code: "report-storage-refused" },
    { phase: "cli-preflight", code: "child-cleanup-unconfirmed" },
    { phase: "child-execution", code: "owned-directory-refused" },
  ])("rejects impossible phase/code combinations", (overrides) => {
    const input = { ...receipt(), ...overrides };
    expect(isHeadlessOperationalFailure(input)).toBe(false);
    expect(() =>
      formatOperationalFailure(input as HeadlessOperationalFailure),
    ).toThrow("Invalid closed operational failure receipt.");
  });

  it("accepts only authored guard override phases", () => {
    for (const phase of [
      "runner-preflight",
      "task-setup",
      "task-cleanup",
      "report-preparation",
      "final-cleanup",
    ] as const) {
      const tracker = createOperationalFailureTracker(phase);
      tracker.refuseIdentity();
      expect(isHeadlessOperationalFailure(tracker.receipt())).toBe(true);
    }
    const cleanup = createOperationalFailureTracker("task-cleanup");
    cleanup.beginChild();
    cleanup.finishChild(false);
    cleanup.unconfirmedCleanup();
    expect(isHeadlessOperationalFailure(cleanup.receipt())).toBe(true);
  });

  it("rejects accessor, symbolic and nonenumerable unknown fields without reading them", () => {
    const getter = vi.fn(() => "PRIVATE_GETTER_CANARY");
    const accessor = { ...receipt() };
    Object.defineProperty(accessor, "phase", { get: getter });
    const hidden = { ...receipt() };
    Object.defineProperty(hidden, "unknown", {
      value: "PRIVATE_HIDDEN_CANARY",
    });
    for (const input of [
      accessor,
      hidden,
      { ...receipt(), [Symbol("private")]: "PRIVATE_SYMBOL_CANARY" },
    ])
      expect(isHeadlessOperationalFailure(input)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });

  it("serializes a descriptor projection, not a caller proxy or its toJSON/get hooks", () => {
    const get = vi.fn(() => {
      throw new Error("PRIVATE_PROXY_CANARY");
    });
    const proxy = new Proxy(receipt(), { get });
    const line = formatOperationalFailure(proxy);
    expect(line).not.toContain("PRIVATE_PROXY_CANARY");
    expect(get).not.toHaveBeenCalled();
    const refused = new Proxy(receipt(), {
      ownKeys: () => {
        throw new Error("PRIVATE_TRAP_CANARY");
      },
    });
    expect(isHeadlessOperationalFailure(refused)).toBe(false);
  });

  it("normalizes unavailable and overflowing clocks to null", () => {
    let clock = -Number.MAX_VALUE;
    const tracker = createOperationalFailureTracker(
      "runner-preflight",
      () => clock,
    );
    tracker.beginChild();
    clock = Number.MAX_VALUE;
    expect(tracker.receipt().timing).toEqual({
      elapsedMs: null,
      phaseElapsedMs: null,
      childElapsedMs: null,
    });
    expect(isHeadlessOperationalFailure(tracker.receipt())).toBe(true);
    expect(
      createOperationalFailureTracker("runner-preflight", () => NaN).receipt()
        .timing.elapsedMs,
    ).toBeNull();
    expect(
      createOperationalFailureTracker("runner-preflight", () => {
        throw new Error("PRIVATE_CLOCK_CANARY");
      }).receipt().timing.elapsedMs,
    ).toBeNull();
  });

  it("isolates throwing and rejecting trusted sinks without waiting for pending completion", async () => {
    const value = receipt();
    expect(() =>
      emitOperationalFailure(() => {
        throw new Error("PRIVATE_SINK_CANARY");
      }, value),
    ).not.toThrow();
    const rejecting = vi.fn(async () => {
      throw new Error("PRIVATE_ASYNC_CANARY");
    });
    emitOperationalFailure(rejecting, value);
    emitOperationalFailure(() => new Promise<void>(() => undefined), value);
    await Promise.resolve();
    await Promise.resolve();
    expect(rejecting).toHaveBeenCalledOnce();
  });

  it("observes rejection of a callable thenable without awaiting it", async () => {
    const then = vi.fn(
      (_resolve: unknown, reject: (reason: unknown) => void) => {
        reject(new Error("PRIVATE_CALLABLE_CANARY"));
      },
    );
    const callable = Object.assign(() => undefined, { then });
    emitOperationalFailure(() => callable, receipt());
    await Promise.resolve();
    await Promise.resolve();
    expect(then).toHaveBeenCalledOnce();
  });

  it("marks backwards clocks unavailable rather than a measured zero", () => {
    let clock = 100;
    const tracker = createOperationalFailureTracker(
      "runner-preflight",
      () => clock,
    );
    tracker.beginChild();
    clock = 99;
    expect(tracker.receipt().timing).toEqual({
      elapsedMs: null,
      phaseElapsedMs: null,
      childElapsedMs: null,
    });
  });
});
