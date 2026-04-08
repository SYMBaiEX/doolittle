import type {
  AgentIdentityRecord,
  UserProfileBeliefSummary,
  UserProfileContextSummary,
  UserProfileEngagementSummary,
  UserProfileRecord,
  UserProfileRelationshipSummary,
} from "@/types";
import type { UserProfileRecallHit } from "./types";

/**
 * Minimal read-only surface that the insight helpers need from
 * UserProfileService. Keeps this module free of storage concerns.
 */
export interface ProfileReader {
  list(): UserProfileRecord[];
  get(userId: string): UserProfileRecord;
  getAgent(): AgentIdentityRecord;
  beliefs(userId: string): UserProfileBeliefSummary;
  relationship(userId: string): UserProfileRelationshipSummary;
  engagement(userId: string): UserProfileEngagementSummary;
}

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

function unique(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function scoreCadence(touches: number): "low" | "steady" | "high" {
  if (touches >= 15) return "high";
  if (touches >= 4) return "steady";
  return "low";
}

/* ------------------------------------------------------------------ */
/*  recall                                                             */
/* ------------------------------------------------------------------ */

export function recall(
  reader: ProfileReader,
  userId: string,
  query: string,
  limit = 8,
): UserProfileRecallHit[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  const profile = reader.get(userId);
  const candidates: UserProfileRecallHit[] = [];

  const pushMatches = (
    kind: UserProfileRecallHit["kind"],
    values: string[] | undefined,
  ) => {
    for (const value of values ?? []) {
      const lower = value.toLowerCase();
      if (!lower.includes(normalized)) continue;
      const exact = lower === normalized ? 100 : 50;
      const starts = lower.startsWith(normalized) ? 20 : 0;
      const score = exact + starts + Math.max(1, 25 - value.length / 8);
      candidates.push({ kind, value, score });
    }
  };

  if (profile.displayName?.toLowerCase().includes(normalized)) {
    candidates.push({
      kind: "displayName",
      value: profile.displayName,
      score: 110,
    });
  }

  pushMatches("alias", profile.aliases);
  pushMatches("preference", profile.preferences);
  pushMatches("fact", profile.facts);
  pushMatches("goal", profile.goals);
  pushMatches("context", profile.projectContext);
  pushMatches("constraint", profile.constraints);
  pushMatches("memory", profile.explicitMemories);
  pushMatches("tool", profile.toolPreferences);
  pushMatches("workStyle", profile.workStyle);
  pushMatches("note", profile.notes);
  pushMatches("belief", profile.beliefs);
  pushMatches("relationship", profile.relationship?.notes);
  pushMatches("engagement", profile.engagement?.recentSignals);

  return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
}

/* ------------------------------------------------------------------ */
/*  context                                                            */
/* ------------------------------------------------------------------ */

export function context(
  reader: ProfileReader,
  userId: string,
  query: string,
): UserProfileContextSummary {
  const profile = reader.get(userId);
  const relationship = reader.relationship(userId);
  const engagement = reader.engagement(userId);
  const beliefs = reader.beliefs(userId);
  const recallHits = recall(reader, userId, query, 6);

  const evidence = unique([
    ...recallHits.map((entry) => `${entry.kind}: ${entry.value}`),
    ...(profile.goals ?? []).slice(0, 2).map((entry) => `goal: ${entry}`),
    ...(profile.projectContext ?? [])
      .slice(0, 2)
      .map((entry) => `context: ${entry}`),
    ...(profile.constraints ?? [])
      .slice(0, 2)
      .map((entry) => `constraint: ${entry}`),
  ]).slice(0, 8);

  return {
    userId,
    displayName: profile.displayName,
    query,
    answer: [
      profile.displayName
        ? `${profile.displayName} is operating with`
        : "This user is operating with",
      `${profile.userMemoryMode ?? profile.memoryMode ?? "hybrid"} user memory`,
      `and ${profile.assistantMemoryMode ?? profile.memoryMode ?? "hybrid"} assistant memory.`,
      `Relationship status is ${relationship.status} with trust ${relationship.trust}/10 and collaboration ${relationship.collaboration}/10.`,
      `Engagement cadence is ${scoreCadence(engagement.touches)} with ${engagement.touches} touches.`,
      beliefs.count
        ? `Known beliefs: ${beliefs.beliefs.slice(0, 3).join("; ")}.`
        : "No strong explicit beliefs are recorded yet.",
      evidence.length
        ? `Most relevant evidence: ${evidence.slice(0, 4).join(" | ")}`
        : "There is not enough matching evidence yet, so the profile should be expanded through more observation.",
    ].join(" "),
    evidence,
    userMemoryMode: profile.userMemoryMode ?? profile.memoryMode ?? "hybrid",
    assistantMemoryMode:
      profile.assistantMemoryMode ?? profile.memoryMode ?? "hybrid",
    dialecticMode: profile.dialecticMode ?? "assist",
  };
}
