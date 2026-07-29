import type { SessionSummary } from "../shared/contracts";
import { asArray, asNumber, asRecord, asString, titleCase } from "./lib";

export interface DashboardSessionCard {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  lastActivityLabel: string;
}

export interface DashboardApprovalCard {
  id: string;
  command: string;
  reason: string;
  expiresAt?: string;
  createdAt?: string;
}

export interface DashboardTaskCard {
  id: string;
  title: string;
  status: string;
  profile: string;
  priority: string;
  executionMode: string;
  updatedAt?: string;
}

export interface DashboardSetupEntry {
  key: string;
  label: string;
  value: string;
  tone: "good" | "warn" | "neutral";
}

export interface DashboardRepoSnapshot {
  branch: string;
  upstream?: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  changedFiles: number;
  lines: string[];
}

export interface DashboardNextAction {
  id: string;
  title: string;
  description: string;
  tone: "good" | "warn" | "neutral";
  target: "review" | "tasks" | "setup" | "chat";
}

function compactListSummary(values: unknown[]): string {
  const ready = values.filter((value) => asRecord(value).ready === true).length;
  if (values.length === 0) return "None reported";
  if (ready > 0 || values.some((value) => "ready" in asRecord(value))) {
    return `${ready}/${values.length} ready`;
  }
  return `${values.length} ${values.length === 1 ? "item" : "items"}`;
}

export function summarizeDashboardValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return compactListSummary(value);

  const record = asRecord(value);
  if (Object.keys(record).length === 0) return "No details reported";

  const headline = asString(record.headline);
  const detail = asString(record.detail);
  if (headline || detail) return [headline, detail].filter(Boolean).join(" — ");

  const name = asString(record.name);
  const version = asString(record.version);
  if (name || version) {
    const runtime = [
      asString(record.node) ? `Node ${asString(record.node)}` : "",
      asString(record.nub) ? `Nub ${asString(record.nub)}` : "",
    ].filter(Boolean);
    return [`${name} ${version}`.trim(), ...runtime].join(" · ");
  }

  const numericEntries = Object.entries(record).filter(
    ([, entry]) => typeof entry === "number",
  );
  if (numericEntries.length > 0) {
    return numericEntries
      .slice(0, 4)
      .map(([key, entry]) => `${titleCase(key)} ${entry}`)
      .join(" · ");
  }

  return `${Object.keys(record).length} signals`;
}

function countChangedFiles(lines: string[]): number {
  return lines.filter((line) => line.trim().length > 0).length;
}

function parseAheadBehind(flags: string): { ahead: number; behind: number } {
  const aheadMatch = flags.match(/ahead\s+(\d+)/u);
  const behindMatch = flags.match(/behind\s+(\d+)/u);
  return {
    ahead: Number.parseInt(aheadMatch?.[1] ?? "0", 10) || 0,
    behind: Number.parseInt(behindMatch?.[1] ?? "0", 10) || 0,
  };
}

export function summarizeRepoStatus(
  status: string | undefined,
): DashboardRepoSnapshot {
  const lines = (status ?? "")
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter(Boolean);

  if (!lines.length) {
    return {
      branch: "Workspace",
      ahead: 0,
      behind: 0,
      dirty: false,
      changedFiles: 0,
      lines: [],
    };
  }

  const [head, ...rest] = lines;
  const match = head.match(
    /^##\s+(?<branch>.+?)(?:\.\.\.(?<upstream>\S+))?(?:\s+\[(?<flags>[^\]]+)\])?$/u,
  );
  const flags = parseAheadBehind(match?.groups?.flags ?? "");

  return {
    branch: match?.groups?.branch ?? "Workspace",
    upstream: match?.groups?.upstream,
    ahead: flags.ahead,
    behind: flags.behind,
    dirty: rest.length > 0,
    changedFiles: countChangedFiles(rest),
    lines: rest,
  };
}

function setupEntryTone(value: string): DashboardSetupEntry["tone"] {
  const normalized = value.trim().toLowerCase();
  const readinessFractions = Array.from(
    normalized.matchAll(/\b(?<ready>\d+)\/(?<total>\d+)\s+ready\b/gu),
  );
  const hasIncompleteReadiness = readinessFractions.some((match) => {
    const ready = Number.parseInt(match.groups?.ready ?? "0", 10);
    const total = Number.parseInt(match.groups?.total ?? "0", 10);
    return total > 0 && ready < total;
  });
  if (
    hasIncompleteReadiness ||
    normalized === "false" ||
    normalized.includes("attention") ||
    normalized.includes("pending") ||
    normalized.includes("missing") ||
    normalized.includes("required") ||
    normalized.includes("disabled") ||
    normalized.includes("incomplete") ||
    normalized.includes("not ")
  ) {
    return "warn";
  }
  if (
    normalized === "true" ||
    (normalized.includes("ready") && !hasIncompleteReadiness) ||
    normalized.includes("enabled") ||
    normalized.includes("configured") ||
    normalized.includes("connected") ||
    normalized.includes("ok")
  ) {
    return "good";
  }
  return "neutral";
}

export function summarizeSetupEntries(summary: unknown): DashboardSetupEntry[] {
  return Object.entries(asRecord(summary)).map(([key, value]) => {
    const rendered = summarizeDashboardValue(value);
    return {
      key,
      label: titleCase(key),
      value: rendered,
      tone: setupEntryTone(rendered),
    };
  });
}

export function normalizeSessions(
  sessions: SessionSummary[],
): DashboardSessionCard[] {
  return [...sessions]
    .sort((left, right) =>
      (right.endedAt ?? right.startedAt ?? "").localeCompare(
        left.endedAt ?? left.startedAt ?? "",
      ),
    )
    .slice(0, 6)
    .map((session) => ({
      id: session.sessionId,
      title:
        session.title?.trim() || session.preview[0]?.trim() || "Conversation",
      preview: session.preview[0]?.trim() || session.sessionId,
      messageCount: session.messageCount,
      lastActivityLabel: session.endedAt ?? session.startedAt ?? "",
    }));
}

export function normalizeApprovals(values: unknown[]): DashboardApprovalCard[] {
  return values
    .map((value) => asRecord(value))
    .map((record, index) => ({
      id: asString(record.id, `approval-${index}`),
      command: asString(record.command, "Command approval"),
      reason: asString(record.reason, "No reason provided"),
      expiresAt: asString(record.expiresAt) || undefined,
      createdAt: asString(record.createdAt) || undefined,
    }))
    .slice(0, 6);
}

export function normalizeTasks(values: unknown[]): DashboardTaskCard[] {
  return values
    .map((value) => asRecord(value))
    .map((record, index) => ({
      id: asString(record.id, `task-${index}`),
      title:
        asString(record.title).trim() ||
        asString(record.objective).trim() ||
        "Untitled task",
      status: asString(record.status, "unknown"),
      profile: asString(record.profile, "general"),
      priority: asString(record.priority, "normal"),
      executionMode: asString(record.executionMode, "local"),
      updatedAt:
        asString(record.updatedAt) ||
        asString(record.startedAt) ||
        asString(record.createdAt) ||
        undefined,
    }))
    .slice(0, 6);
}

export function countRuntimePlugins(
  plugins: Record<string, boolean> | undefined,
): number {
  return Object.values(plugins ?? {}).filter(Boolean).length;
}

export function countOwnershipSignals(
  ownership: Record<string, unknown> | undefined,
): number {
  return Object.keys(ownership ?? {}).length;
}

export function buildNextActions(input: {
  pendingApprovals: number;
  runningTasks: number;
  repo: DashboardRepoSnapshot;
  setupEntries: DashboardSetupEntry[];
  sessions: DashboardSessionCard[];
}): DashboardNextAction[] {
  const actions: DashboardNextAction[] = [];
  if (input.pendingApprovals > 0) {
    actions.push({
      id: "approvals",
      title: "Clear pending approvals",
      description: `${input.pendingApprovals} request${
        input.pendingApprovals === 1 ? "" : "s"
      } waiting in review.`,
      tone: "warn",
      target: "review",
    });
  }
  if (input.runningTasks > 0) {
    actions.push({
      id: "tasks",
      title: "Check running tasks",
      description: `${input.runningTasks} delegated task${
        input.runningTasks === 1 ? "" : "s"
      } still active.`,
      tone: "neutral",
      target: "tasks",
    });
  }
  const setupWarnings = input.setupEntries.filter(
    (entry) => entry.tone === "warn",
  );
  if (setupWarnings.length > 0) {
    actions.push({
      id: "setup",
      title: "Finish operator setup",
      description: `${setupWarnings.length} setup signal${
        setupWarnings.length === 1 ? "" : "s"
      } still need attention.`,
      tone: "warn",
      target: "setup",
    });
  }
  if (input.repo.dirty || input.repo.behind > 0) {
    actions.push({
      id: "workspace",
      title: "Inspect workspace state",
      description: input.repo.dirty
        ? `${input.repo.changedFiles} file${
            input.repo.changedFiles === 1 ? "" : "s"
          } changed in the current checkout.`
        : `${input.repo.behind} commit${
            input.repo.behind === 1 ? "" : "s"
          } behind upstream.`,
      tone: "neutral",
      target: "review",
    });
  }
  if (actions.length === 0) {
    actions.push({
      id: "chat",
      title: "Start the next run",
      description: input.sessions[0]?.title
        ? `Resume ${input.sessions[0].title}.`
        : "The workspace is clear enough to start a new conversation.",
      tone: "good",
      target: "chat",
    });
  }
  return actions.slice(0, 4);
}

export function summarizeSetupHealth(entries: DashboardSetupEntry[]): {
  warnings: number;
  healthy: number;
} {
  return entries.reduce(
    (summary, entry) => {
      if (entry.tone === "warn") summary.warnings += 1;
      if (entry.tone === "good") summary.healthy += 1;
      return summary;
    },
    { warnings: 0, healthy: 0 },
  );
}

export function sessionCountSummary(sessions: SessionSummary[] | undefined): {
  total: number;
  messages: number;
} {
  return (sessions ?? []).reduce(
    (summary, session) => {
      summary.total += 1;
      summary.messages += asNumber(session.messageCount, 0);
      return summary;
    },
    { total: 0, messages: 0 },
  );
}

export function normalizeSummaryArray(value: unknown): unknown[] {
  return asArray(value);
}
