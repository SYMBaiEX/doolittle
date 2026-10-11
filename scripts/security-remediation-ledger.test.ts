import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) =>
  JSON.parse(readFileSync(resolve(root, path), "utf8"));
const baseline = read(
  "docs/security/code-scanning/remediation-baseline-2026-10-11.json",
);
const ledger = read(
  "docs/security/code-scanning/remediation-dispositions-2026-10-11.json",
);

describe("current security remediation evidence", () => {
  it("preserves each baseline identity and rating exactly once", () => {
    expect(ledger.alerts).toHaveLength(baseline.alerts.length);
    expect(
      new Set(ledger.alerts.map((alert: { id: number }) => alert.id)).size,
    ).toBe(baseline.alerts.length);
    for (const alert of ledger.alerts) {
      const original = baseline.alerts.find(
        (entry: { number: number }) => entry.number === alert.id,
      );
      expect(original).toBeDefined();
      expect({
        rule: alert.rule,
        severity: alert.securitySeverity,
        url: alert.alertUrl,
        ...alert.baseline,
      }).toEqual({
        rule: original.rule,
        severity: original.securitySeverity,
        url: original.url,
        path: original.path,
        line: original.line,
        commit: original.commit,
      });
    }
  });

  it("separates historical triage from verified current source anchors", () => {
    for (const alert of ledger.alerts) {
      expect(alert.sourceAndSink.trim()).not.toBe("");
      expect(alert.evidence).toBeUndefined();
      for (const anchor of alert.currentEvidence) {
        expect(anchor.path).not.toContain("..");
        expect(anchor.path.startsWith("packages/")).toBe(true);
        const lines = readFileSync(resolve(root, anchor.path), "utf8").split(
          "\n",
        );
        expect(lines[anchor.line - 1]).toContain(anchor.detail);
      }
    }
  });

  it("reports source dispositions without claiming GitHub closure", () => {
    const counts: Record<string, number> = {};
    for (const alert of ledger.alerts)
      counts[alert.classification] = (counts[alert.classification] ?? 0) + 1;
    expect(counts).toEqual(ledger.classificationCounts);
    expect(ledger.scope).toContain("not fresh CodeQL or GitHub alert closure");
    expect(
      ledger.limitations.some((note: string) => note.includes("version-based")),
    ).toBe(true);
  });
});
