import type { SetupSummary, UpdatePreview } from "@/services/operator/service";
import type { DiagnosticCheck } from "@/types";

function normalizeDiagnosticStatus(status: string): string {
  return status === "ok" ? "pass" : status;
}

export function formatDoctorSummary(checks: DiagnosticCheck[]): string {
  const normalized = checks.map((check) => ({
    ...check,
    status: normalizeDiagnosticStatus(check.status),
  }));
  const counts = {
    pass: normalized.filter((check) => check.status === "pass").length,
    warn: normalized.filter((check) => check.status === "warn").length,
    fail: normalized.filter((check) => check.status === "fail").length,
  };
  const attention = normalized.filter(
    (check) => check.status === "warn" || check.status === "fail",
  );
  const lines = [
    "Doctor",
    `Overall: ${counts.pass} pass, ${counts.warn} warn, ${counts.fail} fail`,
  ];

  if (attention.length === 0) {
    lines.push(
      "",
      "No warning or failure checks. The core shell looks ready.",
      "Next: review `/setup summary` when you change providers, transports, or execution settings.",
    );
    return lines.join("\n");
  }

  lines.push("", "Attention:");
  for (const check of attention.slice(0, 8)) {
    lines.push(
      `- [${check.status.toUpperCase()}] ${check.summary}: ${check.detail}`,
    );
  }
  lines.push(
    "",
    "Next:",
    "1. Review `/setup summary` for provider and transport readiness.",
    "2. Fix the warning/failure checks above before relying on long-running automation.",
    "3. Re-run `/doctor` after configuration changes.",
  );
  return lines.join("\n");
}

export function formatSetupSummary(summary: SetupSummary): string {
  const readyProviders = summary.providers.filter(
    (entry) => entry.ready,
  ).length;
  const readyTransports = summary.transports.filter(
    (entry) => entry.ready,
  ).length;
  const missingDirectories = summary.directories.filter(
    (entry) => !entry.exists,
  );
  const lines = [
    "Setup Summary",
    `Status: ${summary.readiness.level.toUpperCase()}`,
    summary.readiness.headline,
    summary.readiness.detail,
    "",
    `Providers ready: ${readyProviders}/${summary.providers.length}`,
    `Transports ready: ${readyTransports}/${summary.transports.length}`,
    `Directories missing: ${missingDirectories.length}`,
  ];

  const providerAttention = summary.providers.filter((entry) => !entry.ready);
  const transportAttention = summary.transports.filter((entry) => !entry.ready);
  if (providerAttention.length > 0) {
    lines.push("", "Providers needing attention:");
    for (const entry of providerAttention.slice(0, 4)) {
      lines.push(`- ${entry.id}: ${entry.detail}`);
    }
  }
  if (transportAttention.length > 0) {
    lines.push("", "Transports needing attention:");
    for (const entry of transportAttention.slice(0, 4)) {
      lines.push(`- ${entry.id}: ${entry.detail}`);
    }
  }
  if (summary.readiness.nextSteps.length > 0) {
    lines.push("", "Next:");
    summary.readiness.nextSteps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
  }
  return lines.join("\n");
}

export function formatUpdatePreview(update: UpdatePreview): string {
  const lines = [
    "Update Preview",
    `Status: ${update.readiness.level.toUpperCase()}`,
    update.readiness.headline,
    update.readiness.detail,
    "",
    `Repository: ${update.repositoryAvailable ? "available" : "unavailable"}`,
    `Git status: ${update.repositoryStatus}`,
    `Recent commits: ${update.recentCommits}`,
  ];

  if (update.readiness.nextSteps.length > 0) {
    lines.push("", "Runtime follow-up:");
    update.readiness.nextSteps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
  }
  if (update.recommendedSteps.length > 0) {
    lines.push("", "Validation loop:");
    update.recommendedSteps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
  }
  return lines.join("\n");
}
