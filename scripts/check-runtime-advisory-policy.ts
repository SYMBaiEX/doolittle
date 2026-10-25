import { auditProductionWorkspaces } from "./audit-production";

type AuditReport = {
  advisories?: Record<string, { url?: string; severity?: string }>;
  error?: unknown;
};

/** Release dependencies must be clean at every severity, with no backport exceptions. */
export function assertNoRuntimeAdvisories(report: AuditReport): void {
  if (
    report.error ||
    !report.advisories ||
    typeof report.advisories !== "object" ||
    Array.isArray(report.advisories)
  ) {
    throw new Error(
      "Production audit did not provide a valid advisory inventory.",
    );
  }
  const findings = Object.values(report.advisories);
  if (findings.length) {
    throw new Error(
      `Production dependency advisories must be resolved: ${findings
        .map((finding) => finding?.url ?? "INVALID-ADVISORY")
        .sort()
        .join(", ")}`,
    );
  }
}

function run(): void {
  const reports = auditProductionWorkspaces(process.cwd());
  for (const report of reports) assertNoRuntimeAdvisories(report);
  console.log(
    "Production dependency audit clean: zero advisories at every severity.",
  );
}

if (import.meta.main) run();
