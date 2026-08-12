import { asArray, asRecord, asString } from "../value-guards";

export interface SetupChecklistItemView {
  id: string;
  label: string;
  detail: string;
  status: string;
}

export interface SetupSnapshotRow {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "good" | "warn" | "bad";
}

export interface SetupReadinessView {
  detail: string;
  label: string;
  level: "ready" | "needs-attention" | "blocked" | "unknown";
  title: string;
  tone: SetupSnapshotRow["tone"];
}

function readinessTone(value: string): SetupSnapshotRow["tone"] {
  if (value === "ready") return "good";
  if (value === "blocked") return "bad";
  return value ? "warn" : "neutral";
}

function readinessLabel(value: string): string {
  if (value === "ready") return "Ready";
  if (value === "blocked") return "Blocked";
  return value ? "Needs attention" : "Unknown";
}

export function normalizeSetupReadiness(
  value: unknown,
): SetupReadinessView | null {
  const readiness = asRecord(asRecord(asRecord(value).summary).readiness);
  const rawLevel = asString(readiness.level).trim().toLowerCase();
  const level: SetupReadinessView["level"] =
    rawLevel === "ready" ||
    rawLevel === "needs-attention" ||
    rawLevel === "blocked"
      ? rawLevel
      : "unknown";
  const detail = asString(readiness.headline).trim();
  const technicalDetail = asString(readiness.detail).trim();
  if (!detail && !technicalDetail) return null;
  return {
    detail:
      detail ||
      technicalDetail ||
      "Setup readiness is available for inspection.",
    label: readinessLabel(rawLevel),
    level,
    title:
      level === "ready"
        ? "Ready for local work"
        : level === "blocked"
          ? "Setup is blocked"
          : level === "needs-attention"
            ? "Setup needs attention"
            : "Readiness unknown",
    tone: readinessTone(rawLevel),
  };
}

export function normalizeSetupChecklist(
  value: unknown,
): SetupChecklistItemView[] {
  return asArray(asRecord(value).checklist)
    .map((item, index): SetupChecklistItemView | null => {
      if (typeof item === "string") {
        const label = item.trim();
        return label
          ? { id: `guidance-${index}`, label, detail: "", status: "" }
          : null;
      }
      const record = asRecord(item);
      const label = asString(
        record.summary,
        asString(record.label, asString(record.name)),
      ).trim();
      if (!label) return null;
      return {
        id: asString(record.id, `guidance-${index}`),
        label,
        detail: asString(record.detail, asString(record.description)).trim(),
        status: asString(record.status).trim().toLowerCase(),
      };
    })
    .filter((item): item is SetupChecklistItemView => item !== null);
}

export function normalizeSetupSnapshot(value: unknown): SetupSnapshotRow[] {
  const summary = asRecord(asRecord(value).summary);
  const rows: SetupSnapshotRow[] = [];
  const readiness = asRecord(summary.readiness);
  const readinessLevel = asString(readiness.level).toLowerCase();
  const readinessHeadline = asString(readiness.headline).trim();
  if (readinessHeadline) {
    rows.push({
      id: "readiness",
      label: "Readiness",
      value: readinessLabel(readinessLevel),
      detail: [readinessHeadline, asString(readiness.detail).trim()]
        .filter(Boolean)
        .join(" · "),
      tone: readinessTone(readinessLevel),
    });
  }

  const version = asRecord(summary.version);
  const versionNumber = asString(version.version).trim();
  if (versionNumber) {
    const environment = [
      asString(version.node).trim()
        ? `Node ${asString(version.node).trim()}`
        : "",
      asString(version.nub).trim() ? `Nub ${asString(version.nub).trim()}` : "",
    ].filter(Boolean);
    rows.push({
      id: "version",
      label: "Runtime version",
      value: versionNumber,
      detail: environment.join(" · "),
      tone: "neutral",
    });
  }

  const addReadinessRow = (
    id: string,
    label: string,
    source: unknown,
    minimumReady = false,
  ) => {
    const items = asArray(source).map(asRecord);
    if (!items.length) return;
    const ready = items.filter((item) => item.ready === true).length;
    const satisfied = minimumReady ? ready > 0 : ready === items.length;
    rows.push({
      id,
      label,
      value: minimumReady
        ? ready
          ? `${ready}/${items.length} routes`
          : "None ready"
        : `${ready}/${items.length} ready`,
      detail:
        minimumReady && ready
          ? "Model routing available"
          : satisfied
            ? "All checks passed"
            : "Review unavailable entries",
      tone: satisfied ? "good" : "warn",
    });
  };
  addReadinessRow("providers", "Providers", summary.providers, true);
  addReadinessRow("transports", "Gateway routes", summary.transports);

  const directories = asArray(summary.directories).map(asRecord);
  if (directories.length) {
    const existing = directories.filter(
      (entry) => entry.exists === true,
    ).length;
    rows.push({
      id: "directories",
      label: "Local paths",
      value: `${existing}/${directories.length} ready`,
      detail:
        existing === directories.length
          ? "Workspace and data available"
          : "Some local paths are missing",
      tone: existing === directories.length ? "good" : "warn",
    });
  }

  const serviceGroups = asArray(summary.nativeServices).map(asRecord);
  if (serviceGroups.length) {
    const services = serviceGroups.reduce((total, group) => {
      const count = group.count;
      return (
        total +
        (typeof count === "number" && Number.isFinite(count)
          ? count
          : asArray(group.services).length)
      );
    }, 0);
    rows.push({
      id: "services",
      label: "Runtime services",
      value: `${services} available`,
      detail: `${serviceGroups.length} service groups`,
      tone: services ? "good" : "neutral",
    });
  }
  return rows;
}

export function selectPrimarySetupSnapshot(
  rows: SetupSnapshotRow[],
): SetupSnapshotRow[] {
  const primaryIds = new Set(["providers", "directories", "services"]);
  const primary = rows.filter((row) => primaryIds.has(row.id));
  return primary.length ? primary : rows.slice(0, 3);
}
