import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CODING_EVAL_SUITES } from "../coding/cases";
import { createCodingEvalReport } from "../coding/report";
import {
  createHumanReviewSidecar,
  reviewReportFile,
  verifyHumanReviewSidecar,
  writeHumanReviewSidecar,
} from "./sidecar";

const scores = {
  instructionFollowing: 3,
  correctnessAndGrounding: 3,
  coherenceAndUsefulness: 3,
  toolUseAndVerification: 3,
  honestyAndSafety: 3,
  efficiency: 3,
};
const headless = {
  schemaVersion: 4,
  evaluatorVersion: "0.2.9",
  suite: { id: "headless-workflows-v4", version: 4, title: "Test" },
  createdAt: "2026-10-02T00:00:00.000Z",
  source: { revision: "a".repeat(40), workingTreeClean: true },
  summary: { total: 2, suiteWallTimeMs: 20 },
  runs: [
    {
      taskId: "one",
      domain: "research",
      status: "completed",
      elapsedMs: 10,
      timing: {
        taskSetupMs: 1,
        execDurationMs: 8,
        gradingMs: 1,
        execInvocations: 1,
      },
      modelUsage: null,
      traceSummary: {
        journalAvailable: true,
        malformed: false,
        modelRequests: 0,
        modelResponses: 0,
        modelErrors: 0,
        mutationContinuations: 0,
        continuationReasons: {
          "explicitly-incomplete-response": 0,
          "unverified-terminal-response": 0,
          "empty-terminal-response": 0,
        },
        maxContinuationAttempt: null,
        promptChars: null,
      },
      checks: [{ id: "check-one", passed: true }],
      humanReviewRequired: true,
    },
    {
      taskId: "two",
      domain: "research",
      status: "failed",
      elapsedMs: 10,
      timing: {
        taskSetupMs: 1,
        execDurationMs: 8,
        gradingMs: 1,
        execInvocations: 1,
      },
      modelUsage: null,
      traceSummary: {
        journalAvailable: true,
        malformed: false,
        modelRequests: 0,
        modelResponses: 0,
        modelErrors: 0,
        mutationContinuations: 0,
        continuationReasons: {
          "explicitly-incomplete-response": 0,
          "unverified-terminal-response": 0,
          "empty-terminal-response": 0,
        },
        maxContinuationAttempt: null,
        promptChars: null,
      },
      checks: [{ id: "check-two", passed: false }],
      humanReviewRequired: true,
    },
  ],
};
const input = {
  humanReviewAttested: true,
  reviews: [
    { taskId: "one", ratings: scores, criticalFailures: [] },
    { taskId: "two", ratings: scores, criticalFailures: [] },
  ],
};
const bytes = (value: unknown) => Buffer.from(`${JSON.stringify(value)}\n`);

describe("human review sidecars", () => {
  it("binds complete human ratings to exact report bytes and rejects altered identity", () => {
    const sidecar = createHumanReviewSidecar(bytes(headless), input);
    expect(sidecar.report.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(sidecar.provenance).toBe("human-attested");
    expect(verifyHumanReviewSidecar(bytes(headless), sidecar)).toEqual(sidecar);
    expect(() =>
      verifyHumanReviewSidecar(
        bytes({ ...headless, routeLabel: "changed" }),
        sidecar,
      ),
    ).toThrow("exact report bytes");
    expect(() =>
      verifyHumanReviewSidecar(bytes(headless), {
        ...sidecar,
        report: { ...sidecar.report, suiteId: "other" },
      }),
    ).toThrow("identity");
  });

  it("rejects invalid ratings, critical contradictions, duplicate tasks and free text", () => {
    expect(() =>
      createHumanReviewSidecar(bytes(headless), {
        ...input,
        humanReviewAttested: false,
      }),
    ).toThrow("attestation");
    expect(() =>
      createHumanReviewSidecar(bytes(headless), {
        ...input,
        reviews: [
          { ...input.reviews[0], ratings: { ...scores, efficiency: 6 } },
          input.reviews[1],
        ],
      }),
    ).toThrow("integer");
    expect(() =>
      createHumanReviewSidecar(bytes(headless), {
        ...input,
        reviews: [
          { ...input.reviews[0], criticalFailures: ["fabricated_completion"] },
          input.reviews[1],
        ],
      }),
    ).toThrow("conflicts");
    expect(() =>
      createHumanReviewSidecar(bytes(headless), {
        ...input,
        reviews: [input.reviews[0], input.reviews[0]],
      }),
    ).toThrow("duplicated");
    expect(() =>
      createHumanReviewSidecar(bytes(headless), {
        ...input,
        reviews: [
          { ...input.reviews[0], note: "private response" },
          input.reviews[1],
        ],
      }),
    ).toThrow("free text");
    expect(() =>
      createHumanReviewSidecar(bytes(headless), {
        ...input,
        reviews: [
          { ...input.reviews[0], criticalFailures: ["made_up"] },
          input.reviews[1],
        ],
      }),
    ).toThrow("critical");
  });

  it("saves owner-only sidecars without raw report text or paths", () => {
    const directory = mkdtempSync(
      join(realpathSync(tmpdir()), "doolittle-review-"),
    );
    const reportPath = join(directory, "report.json");
    const inputPath = join(directory, "input.json");
    const outputPath = join(directory, "private", "review.json");
    writeFileSync(
      reportPath,
      bytes({
        ...headless,
        secret: "RAW_PROMPT_SECRET",
        workspace: "/private/workspace",
      }),
    );
    writeFileSync(inputPath, JSON.stringify(input));
    reviewReportFile(reportPath, inputPath, outputPath);
    const stored = readFileSync(outputPath, "utf8");
    expect(stored).not.toContain("RAW_PROMPT_SECRET");
    expect(stored).not.toContain("/private/workspace");
    expect(stored).not.toContain(directory);
    expect(() => reviewReportFile(reportPath, inputPath, outputPath)).toThrow();
    expect(readFileSync(outputPath, "utf8")).toBe(stored);
    expect(statSync(outputPath).mode & 0o777).toBe(0o600);
    expect(statSync(join(directory, "private")).mode & 0o777).toBe(0o700);
  });

  it("refuses shared existing output parents without changing their modes", () => {
    const directory = mkdtempSync(
      join(realpathSync(tmpdir()), "doolittle-review-modes-"),
    );
    const sidecar = createHumanReviewSidecar(bytes(headless), input);
    for (const mode of [0o755, 0o1777]) {
      const parent = join(directory, `shared-${mode}`);
      mkdirSync(parent);
      chmodSync(parent, mode);
      const original = statSync(parent).mode & 0o7777;
      expect(() =>
        writeHumanReviewSidecar(join(parent, "review.json"), sidecar),
      ).toThrow("owner-only");
      expect(statSync(parent).mode & 0o7777).toBe(original);
    }
  });

  it("refuses symlinked parents and creates only a private final leaf", () => {
    const directory = mkdtempSync(
      join(realpathSync(tmpdir()), "doolittle-review-link-"),
    );
    const sidecar = createHumanReviewSidecar(bytes(headless), input);
    const target = join(directory, "target");
    mkdirSync(target, { mode: 0o700 });
    symlinkSync(target, join(directory, "link"));
    expect(() =>
      writeHumanReviewSidecar(join(directory, "link", "review.json"), sidecar),
    ).toThrow("symlink");
    expect(() =>
      writeHumanReviewSidecar(
        join(directory, "link", "new-private", "review.json"),
        sidecar,
      ),
    ).toThrow("symlink");
    const output = join(directory, "new-private", "review.json");
    writeHumanReviewSidecar(output, sidecar);
    expect(statSync(join(directory, "new-private")).mode & 0o777).toBe(0o700);
    expect(statSync(output).mode & 0o777).toBe(0o600);
  });

  it("refuses replaceable shared ancestry without creating a private leaf", () => {
    const directory = mkdtempSync(
      join(realpathSync(tmpdir()), "doolittle-review-ancestry-"),
    );
    const shared = join(directory, "shared");
    mkdirSync(shared);
    chmodSync(shared, 0o777);
    const sidecar = createHumanReviewSidecar(bytes(headless), input);
    expect(() =>
      writeHumanReviewSidecar(join(shared, "private", "review.json"), sidecar),
    ).toThrow("prevent replacement");
    expect(statSync(shared).mode & 0o777).toBe(0o777);
    expect(() => statSync(join(shared, "private"))).toThrow();

    // Sticky shared ancestors protect caller-owned entries without chmod.
    chmodSync(shared, 0o1777);
    writeHumanReviewSidecar(join(shared, "private", "review.json"), sidecar);
    expect(statSync(shared).mode & 0o7777).toBe(0o1777);
    expect(statSync(join(shared, "private")).mode & 0o777).toBe(0o700);
  });

  it("refuses final file symlinks, read-only parents and parent traversal", () => {
    const directory = mkdtempSync(
      join(realpathSync(tmpdir()), "doolittle-review-output-"),
    );
    const sidecar = createHumanReviewSidecar(bytes(headless), input);
    const target = join(directory, "target.json");
    writeFileSync(target, "existing evidence");
    const output = join(directory, "review.json");
    symlinkSync(target, output);
    expect(() => writeHumanReviewSidecar(output, sidecar)).toThrow();
    expect(readFileSync(target, "utf8")).toBe("existing evidence");
    expect(() =>
      writeHumanReviewSidecar(`${directory}/child/../review.json`, sidecar),
    ).toThrow("traverse");
    chmodSync(directory, 0o500);
    expect(() =>
      writeHumanReviewSidecar(join(directory, "new.json"), sidecar),
    ).toThrow("owner-only and writable");
    expect(statSync(directory).mode & 0o777).toBe(0o500);
    chmodSync(directory, 0o700);
  });

  it("requires the canonical headless v4 shape before creating or verifying evidence", () => {
    const sidecar = createHumanReviewSidecar(bytes(headless), input);
    const incomplete: Record<string, unknown> = { ...headless };
    delete incomplete.source;
    expect(() => createHumanReviewSidecar(bytes(incomplete), input)).toThrow();
    expect(() =>
      verifyHumanReviewSidecar(bytes(incomplete), sidecar),
    ).toThrow();
    for (const field of [
      "domain",
      "elapsedMs",
      "timing",
      "modelUsage",
      "traceSummary",
    ]) {
      const run: Record<string, unknown> = { ...headless.runs[0] };
      delete run[field];
      expect(() =>
        createHumanReviewSidecar(
          bytes({ ...headless, runs: [run, headless.runs[1]] }),
          input,
        ),
      ).toThrow();
    }
    expect(() =>
      createHumanReviewSidecar(
        bytes({ ...headless, route: { provider: "invalid" } }),
        input,
      ),
    ).toThrow();
  });

  it("fails closed for unsupported or mismatched report schemas", () => {
    expect(() =>
      createHumanReviewSidecar(bytes({ ...headless, schemaVersion: 3 }), input),
    ).toThrow("Unsupported");
    expect(() =>
      createHumanReviewSidecar(
        bytes({ ...headless, runs: [headless.runs[0], headless.runs[0]] }),
        input,
      ),
    ).toThrow("Duplicate");
    expect(() =>
      createHumanReviewSidecar(bytes(headless), {
        ...input,
        reviews: [input.reviews[0], { ...input.reviews[1], taskId: "missing" }],
      }),
    ).toThrow("absent");
  });

  it("requires coding task and run identities from a comparison-ready report", () => {
    const suite = CODING_EVAL_SUITES["coding-harness-v1"];
    const task = suite.tasks[0];
    if (!task) throw new Error("Missing coding task.");
    const report = createCodingEvalReport({
      workspace: "/tmp/private-fixture",
      suite,
      taskSetId: "coding-harness-v1",
      fixtureId: "fixture",
      createdAt: "2026-10-02T00:00:00.000Z",
      runs: [
        {
          taskId: task.id,
          run: {
            startedAt: "2026-10-02T00:00:00.000Z",
            endedAt: "2026-10-02T00:00:01.000Z",
          },
          evaluation: {
            runId: "run-1",
            caseId: task.caseId,
            status: "pass",
            score: 1,
            maxScore: 1,
            checks: [{ id: "build", status: "pass", weight: 1, evidence: [] }],
          },
        },
      ],
    });
    const codingInput = {
      humanReviewAttested: true,
      reviews: [
        {
          taskId: task.id,
          runId: "run-1",
          ratings: scores,
          criticalFailures: [],
        },
      ],
    };
    expect(
      createHumanReviewSidecar(bytes(report), codingInput).report.kind,
    ).toBe("coding");
    expect(() =>
      createHumanReviewSidecar(bytes(report), {
        ...codingInput,
        reviews: [{ ...codingInput.reviews[0], runId: "other" }],
      }),
    ).toThrow("run identity");
  });
});
