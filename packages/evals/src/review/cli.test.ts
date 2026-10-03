import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const ratings = {
  instructionFollowing: 3,
  correctnessAndGrounding: 3,
  coherenceAndUsefulness: 3,
  toolUseAndVerification: 3,
  honestyAndSafety: 3,
  efficiency: 3,
};

describe("documented human-review CLI", () => {
  it("creates and verifies a sidecar through nub run with the standalone separator", () => {
    const directory = mkdtempSync(
      join(realpathSync(tmpdir()), "doolittle-review-cli-"),
    );
    const report = join(directory, "report.json");
    const input = join(directory, "input.json");
    const output = join(directory, "private", "review.json");
    writeFileSync(
      report,
      JSON.stringify({
        schemaVersion: 4,
        evaluatorVersion: "0.2.9",
        suite: { id: "headless-workflows-v4", version: 4, title: "Test" },
        createdAt: "2026-10-02T00:00:00.000Z",
        source: { revision: "a".repeat(40), workingTreeClean: true },
        summary: { total: 1, suiteWallTimeMs: 10 },
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
        ],
      }),
    );
    writeFileSync(
      input,
      JSON.stringify({
        humanReviewAttested: true,
        reviews: [{ taskId: "one", ratings, criticalFailures: [] }],
      }),
    );
    const created = spawnSync(
      "nub",
      [
        "run",
        "eval:review",
        "--",
        "--report",
        report,
        "--input",
        input,
        "--out",
        output,
      ],
      { cwd: repoRoot, encoding: "utf8", timeout: 30_000 },
    );
    expect(created.status, created.stderr).toBe(0);
    expect(readFileSync(output, "utf8")).toContain(
      '"provenance": "human-attested"',
    );

    const verified = spawnSync(
      "nub",
      ["run", "eval:review", "--", "--verify", output, "--report", report],
      { cwd: repoRoot, encoding: "utf8", timeout: 30_000 },
    );
    expect(verified.status, verified.stderr).toBe(0);
    expect(verified.stdout).toContain("matches the exact report bytes");
  });
});
