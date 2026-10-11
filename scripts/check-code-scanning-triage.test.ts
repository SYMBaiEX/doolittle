import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Snapshot = { alerts: Array<{ number: number; sha: string }> };
type Ledger = {
  baselineCommit: string;
  coverage: {
    baseline: number;
    reviewed: number;
    unreviewed: number;
    classificationCounts: Record<string, number>;
  };
  alerts: Array<{
    number: number;
    classification: string;
    reason: string;
    evidence: Array<{ path: string; line: number; detail: string }>;
  }>;
};

const snapshot = JSON.parse(
  readFileSync(
    new URL(
      "../docs/security/code-scanning/alerts-2026-10-11.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as Snapshot;
const ledger = JSON.parse(
  readFileSync(
    new URL(
      "../docs/security/code-scanning/ledger-2026-10-11.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as Ledger;

describe("CodeQL review ledger coverage", () => {
  it("accounts for every captured alert exactly once", () => {
    const expected = snapshot.alerts
      .map((alert) => alert.number)
      .sort((a, b) => a - b);
    const reviewed = ledger.alerts
      .map((alert) => alert.number)
      .sort((a, b) => a - b);
    expect(expected).toHaveLength(196);
    expect(reviewed).toEqual(expected);
    expect(new Set(reviewed).size).toBe(196);
    expect(ledger.coverage).toMatchObject({
      baseline: 196,
      reviewed: 196,
      unreviewed: 0,
    });
    expect(new Set(snapshot.alerts.map((alert) => alert.sha))).toEqual(
      new Set([ledger.baselineCommit]),
    );
  });

  it("requires a reason and source evidence for each explicit disposition", () => {
    const allowed = new Set([
      "fixed",
      "hardening",
      "intentional-local",
      "test-only",
      "false-positive",
      "guarded",
    ]);
    const counts: Record<string, number> = {};
    for (const alert of ledger.alerts) {
      expect(allowed.has(alert.classification)).toBe(true);
      expect(alert.reason.trim().length).toBeGreaterThan(40);
      expect(alert.evidence.length).toBeGreaterThan(0);
      for (const evidence of alert.evidence) {
        expect(evidence.path.trim().length).toBeGreaterThan(0);
        expect(evidence.path).not.toMatch(/^(?:[a-z]:|[\\/])/iu);
        expect(evidence.path.split("/")).not.toContain("..");
        expect(Number.isSafeInteger(evidence.line) && evidence.line > 0).toBe(
          true,
        );
        expect(evidence.detail.trim().length).toBeGreaterThan(0);
      }
      counts[alert.classification] = (counts[alert.classification] ?? 0) + 1;
    }
    expect(counts).toEqual(ledger.coverage.classificationCounts);
  });
});
