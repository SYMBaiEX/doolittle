import * as fs from "node:fs";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { DEFAULT_MODEL_ROUTE } from "@doolittle/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHumanReviewSidecar } from "../review/sidecar";
import {
  aggregateHeadlessEvalReports,
  compareHeadlessEvalReports,
  validateHeadlessEvalReport,
} from "./compare";
import {
  advertisedRoute,
  digest,
  parseRouteEvidence,
  readRequestedRouteEvidence,
} from "./measurement";
import { runHeadlessEvalSuite } from "./runner";

vi.mock("node:fs", async (original) => ({
  ...(await original<typeof import("node:fs")>()),
}));

const roots: string[] = [];
function root(): string {
  const dir = realpathSync(
    mkdtempSync(join(tmpdir(), "headless-measurement-test-")),
  );
  roots.push(dir);
  return dir;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of roots.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
const canary = "PRIVATE_SECRET_MODEL_URL_PROMPT_RESPONSE_ACCOUNT";
function request(model = canary, runId = "private-run", extra = {}) {
  return {
    category: "model",
    event: "model.request",
    provider: "codex",
    model,
    runId,
    sessionId: "private-session",
    roomId: "private-room",
    metadata: {
      prompt: canary,
      baseUrl: canary,
      reasoningEffort: "ultra",
      trajectoryStepId: `private-step-${runId}`,
    },
    ...extra,
  };
}
function journal(dir: string, events: unknown[]) {
  mkdirSync(join(dir, "trajectories"), { recursive: true });
  writeFileSync(
    join(dir, "trajectories", "trajectory-events.jsonl"),
    events.map((value) => JSON.stringify(value)).join("\n"),
  );
}
const suite = {
  id: "measurement-test",
  version: 1,
  title: "Measurement",
  tasks: [
    {
      id: "one",
      domain: "conversation" as const,
      prompt: canary,
      checks: [{ id: "pass", evaluate: () => true }],
      humanReviewRequired: true,
    },
  ],
};
const success = {
  status: 0,
  stdout: JSON.stringify({ ok: true, text: canary }),
  stderr: canary,
  signal: null,
  cleanupSafe: true,
};
async function report(evidence: unknown[] = []) {
  return runHeadlessEvalSuite(suite, {
    reportDir: root(),
    execute: (_command, _args, options) => {
      const dataDir = options.env.DOOLITTLE_DATA_DIR;
      if (!dataDir) throw new Error("Missing isolated data directory.");
      journal(dataDir, evidence);
      return success;
    },
  });
}
describe("content-free headless measurement v5", () => {
  it("refuses a journal replaced after open before reading descriptor bytes", () => {
    const dir = root();
    journal(dir, [request()]);
    const leaf = join(dir, "trajectories", "trajectory-events.jsonl");
    const originalOpen = fs.openSync;
    const reads = vi.spyOn(fs, "readSync");
    vi.spyOn(fs, "openSync").mockImplementation((...args) => {
      const fd = originalOpen(...args);
      renameSync(leaf, `${leaf}.original`);
      writeFileSync(leaf, canary);
      return fd;
    });
    expect(readRequestedRouteEvidence(dir)).toMatchObject({
      status: "partial",
      accepted: 0,
      rejected: 1,
      requested: [],
    });
    expect(reads).not.toHaveBeenCalled();
  });
  it.each(["data", "trajectories", "leaf"])(
    "rejects foreign %s symlinks without route evidence",
    (kind) => {
      const foreign = root();
      const reads = vi.spyOn(fs, "readSync");
      journal(foreign, [request()]);
      const owned = root();
      let data = owned;
      if (kind === "data") {
        data = join(owned, "data");
        symlinkSync(foreign, data, "dir");
      } else if (kind === "trajectories") {
        symlinkSync(
          join(foreign, "trajectories"),
          join(owned, "trajectories"),
          "dir",
        );
      } else {
        mkdirSync(join(owned, "trajectories"));
        symlinkSync(
          join(foreign, "trajectories", "trajectory-events.jsonl"),
          join(owned, "trajectories", "trajectory-events.jsonl"),
        );
      }
      const result = readRequestedRouteEvidence(data);
      expect(result).toMatchObject({
        status: "partial",
        accepted: 0,
        rejected: 1,
        requested: [],
        journalAvailable: false,
      });
      expect(JSON.stringify(result)).not.toContain(canary);
      expect(JSON.stringify(result)).not.toContain(foreign);
      expect(reads).not.toHaveBeenCalled();
    },
  );
  it("retains requested model/subject digests only, without effort/effective/worker promotion", () => {
    const dir = root();
    journal(dir, [request()]);
    const evidence = readRequestedRouteEvidence(dir);
    expect(evidence.status).toBe("requested-only");
    expect(evidence.requested[0]).toMatchObject({
      modelSha256: digest(canary),
      reasoningEffort: null,
      subject: { kind: "parent-turn" },
    });
    expect(evidence.effective).toEqual({
      status: "unavailable",
      provider: null,
      modelSha256: null,
      reasoningEffort: null,
    });
    expect(evidence.worker).toEqual({
      status: "unavailable",
      provenance: null,
    });
    const serialized = JSON.stringify(evidence);
    for (const secret of [
      canary,
      "private-run",
      "private-room",
      "private-session",
      "private-step",
      "ultra",
    ])
      expect(serialized).not.toContain(secret);
    expect(parseRouteEvidence(evidence)).toEqual(evidence);
  });
  it("missing journal is explicitly unavailable, not inferred from product defaults or usage", () => {
    const evidence = readRequestedRouteEvidence(root());
    expect(evidence).toMatchObject({
      status: "unavailable",
      journalAvailable: false,
      accepted: 0,
      requested: [],
    });
    expect(parseRouteEvidence(evidence)).toEqual(evidence);
  });
  it("rejects unattributed and worker-shaped rows without parent promotion", () => {
    const dir = root();
    journal(dir, [
      request(canary, "", { sessionId: "worker-session" }),
      {
        category: "model",
        event: "model.request",
        sessionId: "worker-only",
        model: canary,
        provider: "codex",
      },
    ]);
    expect(readRequestedRouteEvidence(dir)).toMatchObject({
      status: "partial",
      accepted: 0,
      rejected: 2,
      worker: { status: "unavailable" },
    });
  });
  it("marks unsupported providers unknown rather than persisting raw labels", () => {
    const dir = root();
    journal(dir, [request(canary, "run", { provider: canary })]);
    const evidence = readRequestedRouteEvidence(dir);
    expect(evidence.status).toBe("partial");
    expect(evidence.requested[0]?.provider).toBeNull();
    expect(JSON.stringify(evidence)).not.toContain(canary);
  });
  it("distinguishes mixed subjects from contradictory routes for the same subject", () => {
    const dir = root();
    journal(dir, [request("first", "one"), request("second", "two")]);
    expect(readRequestedRouteEvidence(dir).status).toBe("mixed");
    journal(dir, [request("first", "one"), request("second", "one")]);
    const evidence = readRequestedRouteEvidence(dir);
    expect(evidence.status).toBe("conflicting");
    expect(parseRouteEvidence(evidence)).toEqual(evidence);
    expect(() =>
      parseRouteEvidence({ ...evidence, status: "requested-only" }),
    ).toThrow();
  });
  it("bounds request samples and bytes and exports truncation", () => {
    const dir = root();
    journal(
      dir,
      Array.from({ length: 129 }, (_, index) =>
        request("model", `run-${index}`),
      ),
    );
    expect(readRequestedRouteEvidence(dir)).toMatchObject({
      status: "partial",
      accepted: 128,
      truncated: true,
    });
    journal(dir, [{ prompt: canary.repeat(6000) }]);
    expect(readRequestedRouteEvidence(dir)).toMatchObject({
      status: "partial",
      accepted: 0,
      truncated: true,
    });
  });
  it("read failure becomes partial telemetry, not a thrown model/runtime error", () => {
    const dir = root();
    mkdirSync(join(dir, "trajectories", "trajectory-events.jsonl"), {
      recursive: true,
    });
    expect(readRequestedRouteEvidence(dir)).toMatchObject({
      status: "partial",
      rejected: 1,
    });
  });
  it("strict parsing refuses raw secret fields, forged effective evidence, and malformed coverage", () => {
    const evidence = readRequestedRouteEvidence(root());
    for (const invalid of [
      { ...evidence, model: canary },
      {
        ...evidence,
        effective: { ...evidence.effective, modelSha256: digest(canary) },
      },
      { ...evidence, worker: { status: "measured", provenance: "parent" } },
      { ...evidence, accepted: 1 },
    ])
      expect(() => parseRouteEvidence(invalid)).toThrow();
  });
  it("exports non-overlapping clocks and completed write receipt without self-timing claims", async () => {
    const clocks = [
      0, 5, 5, 8, 8, 108, 115, 115, 122, 122, 133, 133, 133, 140, 140, 142, 142,
      146, 146, 155,
    ];
    let index = 0;
    const reportDir = root();
    const result = await runHeadlessEvalSuite(suite, {
      reportDir,
      monotonicNow: () => {
        const clock = clocks[index++];
        if (clock === undefined)
          throw new Error("Unexpected measurement clock.");
        return clock;
      },
      execute: () => success,
    });
    expect(index).toBe(20);
    expect(result.report.runs[0]?.harnessTiming).toEqual({
      coverage: "direct-phases-only",
      setupMs: 3,
      responseProcessingMs: 7,
      gradingMs: 7,
      cleanupMs: 11,
    });
    expect(result.report.runs[0]?.timing.execDurationMs).toBe(100);
    expect(result.report.harnessTiming).toEqual({
      coverage: "direct-phases-only",
      preflightMs: 5,
      reportPreparationMs: 7,
      finalCleanupMs: 2,
      serializationMs: null,
      persistenceMs: null,
      untimed: "inter-phase-bookkeeping-and-receipt-write",
    });
    expect(dirname(result.reportPath)).toBe(reportDir);
    const ownedReportPath = join(reportDir, basename(result.reportPath));
    const bytes = readFileSync(ownedReportPath, "utf8");
    const receipt = JSON.parse(
      readFileSync(`${ownedReportPath}.measurement.json`, "utf8"),
    );
    expect(receipt).toMatchObject({
      reportSchemaVersion: 5,
      reportSha256: digest(bytes),
      serializationMs: 4,
      persistenceMs: 9,
      receiptWriteMs: null,
    });
    expect(statSync(ownedReportPath).mode & 0o777).toBe(0o600);
    expect(statSync(`${ownedReportPath}.measurement.json`).mode & 0o777).toBe(
      0o600,
    );
    expect(bytes).not.toContain(canary);
    expect(JSON.stringify(receipt)).not.toContain(canary);
  });
  it("optional receipt failure leaves grading/report intact and emits no raw error", async () => {
    const reportDir = root();
    const result = await runHeadlessEvalSuite(suite, {
      reportDir,
      writeMeasurementReceipt: () => {
        throw new Error(canary);
      },
      execute: () => success,
    });
    expect(result.exitCode).toBe(0);
    expect(result.measurementReceiptStatus).toBe("unavailable");
    expect(dirname(result.reportPath)).toBe(reportDir);
    const ownedReportPath = join(reportDir, basename(result.reportPath));
    expect(readFileSync(ownedReportPath, "utf8")).not.toContain(canary);
  });
  it("v5 keeps subject-free model usage separate and hashes operator labels", async () => {
    const result = await runHeadlessEvalSuite(suite, {
      reportDir: root(),
      routeLabel: canary,
      execute: () => success,
    });
    expect(result.report.routeLabel).toBe(`sha256:${digest(canary)}`);
    expect(result.report.route).toEqual(advertisedRoute(DEFAULT_MODEL_ROUTE));
    expect(result.report.routeDeclaration.effectiveAttestation).toBe(
      "unavailable",
    );
    expect(result.report.runs[0]?.modelUsage).toBeNull();
  });
  it("archived v5 default declarations remain readable independently of today's default", async () => {
    const result = await report();
    const archived = {
      ...result.report,
      route: advertisedRoute({
        provider: "openai",
        model: canary,
        reasoningEffort: "high",
      }),
    };
    expect(() => validateHeadlessEvalReport(archived)).not.toThrow();
    expect(JSON.stringify(archived)).not.toContain(canary);
    expect(() =>
      validateHeadlessEvalReport({
        ...archived,
        route: { ...archived.route, model: canary },
      }),
    ).toThrow();
    expect(() =>
      validateHeadlessEvalReport({
        ...archived,
        routeLabel: canary,
      }),
    ).toThrow();
    const current = {
      ...result.report,
      source: { revision: "a".repeat(40), workingTreeClean: true },
    };
    const other = {
      ...archived,
      source: current.source,
      createdAt: new Date(Date.parse(current.createdAt) + 1000).toISOString(),
    };
    expect(() => aggregateHeadlessEvalReports([current, other])).toThrow();
  });
  it("legacy v4 remains readable, explicitly unattested, and cannot pool with v5", async () => {
    const result = await report();
    const legacy = {
      ...result.report,
      schemaVersion: 4,
      route: {
        provider: DEFAULT_MODEL_ROUTE.provider,
        model: DEFAULT_MODEL_ROUTE.model,
        reasoningEffort: DEFAULT_MODEL_ROUTE.reasoningEffort,
      },
    };
    expect(compareHeadlessEvalReports(legacy, legacy).routeAttestation).toBe(
      "legacy-unattested",
    );
    expect(() => compareHeadlessEvalReports(legacy, result.report)).toThrow();
    expect(() =>
      aggregateHeadlessEvalReports([legacy, result.report]),
    ).toThrow();
    expect(() =>
      compareHeadlessEvalReports(result.report, {
        ...result.report,
        evaluatorVersion: "other",
      }),
    ).toThrow();
    const incomplete = {
      ...result.report,
      runs: result.report.runs.map((run) => ({
        ...run,
        routeEvidence: undefined,
      })),
    };
    expect(() => validateHeadlessEvalReport(incomplete)).toThrow();
  });
  it.each(["mixed", "conflicting"])(
    "%s routes prohibit comparisons but allow human review",
    async (status) => {
      const result = await report([
        request("one", "a"),
        request("two", status === "mixed" ? "b" : "a"),
      ]);
      expect(result.report.runs[0]?.routeEvidence.status).toBe(status);
      expect(() =>
        compareHeadlessEvalReports(result.report, result.report),
      ).toThrow();
      const ratings = {
        instructionFollowing: 3,
        correctnessAndGrounding: 3,
        coherenceAndUsefulness: 3,
        toolUseAndVerification: 3,
        honestyAndSafety: 3,
        efficiency: 3,
      };
      const sidecar = createHumanReviewSidecar(
        Buffer.from(JSON.stringify(result.report)),
        {
          humanReviewAttested: true,
          reviews: [{ taskId: "one", ratings, criticalFailures: [] }],
        },
      );
      expect(sidecar.report.schemaVersion).toBe(5);
    },
  );
  it("repeat pooling rejects differing observed requests and missing/effective evidence is never upgraded", async () => {
    const first = (await report([request("one", "a")])).report;
    const second = (await report([request("two", "b")])).report;
    for (const value of [first, second])
      value.source = { revision: "a".repeat(40), workingTreeClean: true };
    second.createdAt = new Date(
      Date.parse(first.createdAt) + 1000,
    ).toISOString();
    expect(() => aggregateHeadlessEvalReports([first, second])).toThrow();
    expect(compareHeadlessEvalReports(first, second).routeAttestation).toBe(
      "requested-only-effective-unavailable",
    );
    const same = { ...first, createdAt: second.createdAt };
    const aggregate = aggregateHeadlessEvalReports([first, same]);
    expect(aggregate.routeAttestation).toBe(
      "requested-only-effective-unavailable",
    );
    expect(aggregate.harnessMetrics?.coverage).toBe("direct-phases-only");
    expect(aggregate.tasks[0]?.routeEvidenceCoverage).toEqual({
      requestedRuns: 2,
      unavailableRuns: 0,
      partialRuns: 0,
      effectiveRuns: 0,
      workerRuns: 0,
    });
  });
  it("repeat pooling accepts equivalent advertised routes with reordered JSON fields", async () => {
    const first = (await report()).report;
    first.source = { revision: "a".repeat(40), workingTreeClean: true };
    const reordered = {
      ...first,
      createdAt: new Date(Date.parse(first.createdAt) + 1000).toISOString(),
      route: {
        reasoningEffort: first.route.reasoningEffort,
        modelSha256: first.route.modelSha256,
        provider: first.route.provider,
      },
    };
    // Exercise ordinary parsed JSON as well as in-memory report objects.
    const aggregate = aggregateHeadlessEvalReports([
      first,
      JSON.parse(JSON.stringify(reordered)),
    ]);
    expect(aggregate.reportSamples).toBe(2);
    expect(aggregate.route).toEqual(first.route);
  });
  it("unreadable route telemetry cannot corrupt otherwise successful grading", async () => {
    const reportDir = root();
    const result = await runHeadlessEvalSuite(suite, {
      reportDir,
      execute: (_command, _args, options) => {
        const dataDir = options.env.DOOLITTLE_DATA_DIR;
        if (!dataDir) throw new Error("Missing isolated data directory.");
        mkdirSync(join(dataDir, "trajectories", "trajectory-events.jsonl"), {
          recursive: true,
        });
        return success;
      },
    });
    expect(result.exitCode).toBe(0);
    expect(result.report.runs[0]?.routeEvidence).toMatchObject({
      status: "partial",
      accepted: 0,
      rejected: 1,
    });
    expect(dirname(result.reportPath)).toBe(reportDir);
    const ownedReportPath = join(reportDir, basename(result.reportPath));
    expect(readFileSync(ownedReportPath, "utf8")).not.toContain(canary);
  });
  it("unknown child error codes cannot persist credentials or arbitrary errors", async () => {
    const reportDir = root();
    const result = await runHeadlessEvalSuite(suite, {
      reportDir,
      execute: () => ({
        ...success,
        status: 1,
        error: Object.assign(new Error(canary), { code: canary }),
      }),
    });
    expect(result.exitCode).toBe(1);
    expect(result.report.runs[0]?.errorCode).toBe("headless-exec-failed");
    expect(dirname(result.reportPath)).toBe(reportDir);
    const ownedReportPath = join(reportDir, basename(result.reportPath));
    expect(readFileSync(ownedReportPath, "utf8")).not.toContain(canary);
  });
});
