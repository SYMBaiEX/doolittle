import { spawnSync } from "node:child_process";

type AuditAdvisory = {
  severity?: string;
  url?: string;
  vulnerable_versions?: string;
};

type AuditReport = {
  advisories?: Record<string, AuditAdvisory>;
};

/**
 * Every reviewed high advisory remains listed even when a dependency override
 * removes it from today's graph. This makes a newly published high advisory a
 * release-policy change instead of silently treating it as development-only.
 */
export const REVIEWED_RUNTIME_HIGH_ADVISORIES = new Map([
  ["GHSA-3GC7-FJRX-P6MG", "<=1.1.5"],
  ["GHSA-4CWX-7WF7-3272", ">=7.0.0 <7.29.0 || >=8.0.0 <8.9.0"],
  ["GHSA-5C6J-R48X-RMVQ", "<=7.0.2"],
  ["GHSA-5P2G-FCMC-QVQQ", "<=2.0.2"],
  ["GHSA-96HV-2XVQ-FX4P", ">=8.0.0 <8.21.0"],
  ["GHSA-F88M-G3JW-G9CJ", "<0.35.0"],
  ["GHSA-GCFJ-64VW-6MP9", ">=1.15.2 <1.18.0"],
  ["GHSA-JMR9-QJV8-65GV", "<=2.0.1"],
  ["GHSA-PH9P-34F9-6G65", "<0.2.6"],
  ["GHSA-R5FR-RJXR-66JC", ">=4.0.0 <=4.17.23"],
  ["GHSA-V9P9-HFJ2-HCW8", "<6.24.0"],
  ["GHSA-VRM6-8VPV-QV8Q", "<6.24.0"],
  ["GHSA-VXPW-J846-P89Q", "<6.27.0"],
  ["GHSA-W3RX-R6R6-PGPR", "<=2.0.2"],
  ["GHSA-XCPC-8H2W-3J85", "<0.6.0"],
]);

function advisoryId(url: string): string | undefined {
  return url.match(/\/advisories\/(GHSA-[0-9a-z-]+)$/iu)?.[1]?.toUpperCase();
}

export function assertRuntimeAdvisoryPolicyCoverage(report: AuditReport): void {
  const unknown: string[] = [];
  for (const advisory of Object.values(report.advisories ?? {}).filter(
    (entry) => entry.severity === "high",
  )) {
    const id = advisoryId(advisory.url ?? "") ?? "MISSING-GHSA-URL";
    const reviewedRange = REVIEWED_RUNTIME_HIGH_ADVISORIES.get(id);
    if (!reviewedRange) {
      unknown.push(id);
    } else if (reviewedRange !== advisory.vulnerable_versions) {
      unknown.push(
        `${id} changed range from ${reviewedRange} to ${advisory.vulnerable_versions ?? "missing"}`,
      );
    }
  }
  unknown.sort();
  if (unknown.length > 0) {
    throw new Error(
      `Production audit contains unreviewed high advisories: ${unknown.join(", ")}`,
    );
  }
}

function run(): void {
  const result = spawnSync(
    "nub",
    ["audit", "--production", "--audit-level", "high", "--json"],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (!result.stdout.trim()) {
    throw new Error(
      `Production audit produced no JSON.${result.stderr.trim() ? ` ${result.stderr.trim()}` : ""}`,
    );
  }
  const report = JSON.parse(result.stdout) as AuditReport;
  assertRuntimeAdvisoryPolicyCoverage(report);
  const highCount = Object.values(report.advisories ?? {}).filter(
    (advisory) => advisory.severity === "high",
  ).length;
  console.log(
    `Runtime advisory policy covers all ${highCount} high production advisories.`,
  );
}

if (import.meta.main) run();
