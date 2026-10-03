import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CODING_EVAL_SUITES } from "../coding/cases";
import { createCodingEvalReport } from "../coding/report";
import {
  createHumanReviewSidecar,
  reviewReportFile,
  verifyHumanReviewSidecar,
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
  summary: { total: 2 },
  runs: [
    {
      taskId: "one",
      status: "completed",
      checks: [],
      humanReviewRequired: true,
    },
    { taskId: "two", status: "failed", checks: [], humanReviewRequired: true },
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
    const directory = mkdtempSync(join(tmpdir(), "doolittle-review-"));
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
    expect(statSync(outputPath).mode & 0o777).toBe(0o600);
    expect(statSync(join(directory, "private")).mode & 0o777).toBe(0o700);
    expect(() => reviewReportFile(reportPath, inputPath, outputPath)).toThrow();
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
