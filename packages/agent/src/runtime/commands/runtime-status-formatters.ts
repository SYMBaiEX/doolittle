import type { RunDepth, ToolProgressMode } from "@/types/runtime";
import type { UserProfileWorkspaceSummary } from "@/types/user-profile";

export function formatMemorySummary(summary: {
  target: string;
  entries: number;
  characters: number;
  preview: string[];
}): string {
  return [
    `target=${summary.target}`,
    `entries=${summary.entries}`,
    `characters=${summary.characters}`,
    `preview=${summary.preview.length ? summary.preview.join(" | ") : "none"}`,
  ].join(" ");
}

export function formatPersonalitySummary(summary: {
  total: number;
  activeId?: string;
  names: string[];
}): string {
  return [
    `total=${summary.total}`,
    `active=${summary.activeId ?? "n/a"}`,
    `names=${summary.names.length ? summary.names.join(", ") : "none"}`,
  ].join(" ");
}

export function formatRolodexSummary(
  summary: UserProfileWorkspaceSummary,
): string {
  const formatPairs = (items: Record<string, number>) => {
    const pairs = Object.entries(items)
      .filter(([, value]) => value > 0)
      .map(([key, value]) => `${key}:${value}`);
    return pairs.length ? pairs.join(",") : "none";
  };

  const topChannels = summary.topChannels
    .map((entry) => `${entry.channel}:${entry.count}`)
    .join(", ");
  const topSignals = summary.topSignals
    .map((entry) => `${entry.signal}(${entry.count})`)
    .join(", ");

  return [
    `totalProfiles=${summary.totalProfiles}`,
    `agent=${summary.agentName}`,
    `recent=${summary.recentProfiles.length ? summary.recentProfiles.join(",") : "none"}`,
    `beliefs=${summary.totalBeliefs}`,
    `sources=${summary.totalBeliefSources}`,
    `relationships=${summary.activeRelationships}/${summary.trustedRelationships}`,
    `engaged=${summary.engagedProfiles}`,
    `status=${formatPairs(summary.relationshipStatusCounts)}`,
    `topChannels=${topChannels || "none"}`,
    `topSignals=${topSignals || "none"}`,
  ].join(" ");
}

export function formatExperienceSummary(summary: {
  sessions: { totalSessions: number; recentSessionIds: string[] };
  memory: {
    shared: {
      target: string;
      entries: number;
      characters: number;
      preview: string[];
    };
    user: {
      target: string;
      entries: number;
      characters: number;
      preview: string[];
    };
  };
}): string {
  return [
    `sessions=${summary.sessions.totalSessions}`,
    `recent=${summary.sessions.recentSessionIds.length ? summary.sessions.recentSessionIds.join(",") : "none"}`,
    `memory.shared=${summary.memory.shared.entries}/${summary.memory.shared.characters}`,
    `memory.user=${summary.memory.user.entries}/${summary.memory.user.characters}`,
  ].join(" ");
}

export function formatRunPolicy(
  runDepth: RunDepth,
  maxIterations: number,
  toolProgressMode: ToolProgressMode,
): string {
  return [
    `runDepth=${runDepth}`,
    `maxIterations=${maxIterations}`,
    `toolProgress=${toolProgressMode}`,
  ].join("\n");
}

export function parseRunDepth(raw: string): RunDepth | undefined {
  return raw === "quick" ||
    raw === "standard" ||
    raw === "deep" ||
    raw === "explore"
    ? raw
    : undefined;
}

export function parseToolProgressMode(
  raw: string,
): ToolProgressMode | undefined {
  return raw === "off" || raw === "new" || raw === "all" || raw === "verbose"
    ? raw
    : undefined;
}
