import type { AgentIdentityRecord, UserProfileRecord } from "@/types";
import {
  createDefaultAgentIdentity,
  createDefaultEngagement,
  createDefaultRelationship,
  createEmptyProfile,
} from "./defaults";

export function normalizeRelationship(
  relationship?: Partial<NonNullable<UserProfileRecord["relationship"]>>,
): NonNullable<UserProfileRecord["relationship"]> {
  const next = {
    ...createDefaultRelationship(),
    ...(relationship ?? {}),
    notes: relationship?.notes ?? [],
  };
  const score = next.trust + next.collaboration;
  if (score >= 12 || next.trust >= 8) {
    next.status = "trusted";
  } else if (score >= 6 || next.trust >= 4) {
    next.status = "active";
  } else if (score > 0 || next.collaboration > 0) {
    next.status = "growing";
  } else {
    next.status = "new";
  }
  return next;
}

export function normalizeEngagement(
  engagement?: Partial<NonNullable<UserProfileRecord["engagement"]>>,
): NonNullable<UserProfileRecord["engagement"]> {
  return {
    ...createDefaultEngagement(),
    ...(engagement ?? {}),
    channels: engagement?.channels ?? [],
    sources: engagement?.sources ?? [],
    sessionIds: engagement?.sessionIds ?? [],
    recentSignals: engagement?.recentSignals ?? [],
  };
}

export function hydrateProfile(profile: UserProfileRecord): UserProfileRecord {
  return {
    ...createEmptyProfile(profile.userId),
    ...profile,
    memoryMode: profile.memoryMode ?? "hybrid",
    userMemoryMode: profile.userMemoryMode ?? profile.memoryMode ?? "hybrid",
    assistantMemoryMode:
      profile.assistantMemoryMode ?? profile.memoryMode ?? "hybrid",
    dialecticMode: profile.dialecticMode ?? "assist",
    aliases: profile.aliases ?? [],
    goals: profile.goals ?? [],
    projectContext: profile.projectContext ?? [],
    constraints: profile.constraints ?? [],
    explicitMemories: profile.explicitMemories ?? [],
    toolPreferences: profile.toolPreferences ?? [],
    workStyle: profile.workStyle ?? [],
    beliefs: profile.beliefs ?? [],
    beliefSources: profile.beliefSources ?? [],
    relationship: normalizeRelationship(profile.relationship),
    engagement: normalizeEngagement(profile.engagement),
  };
}

export function hydrateAgent(
  agent?: Partial<AgentIdentityRecord>,
): AgentIdentityRecord {
  return {
    ...createDefaultAgentIdentity(),
    ...(agent ?? {}),
    notes: agent?.notes ?? [],
    goals: agent?.goals ?? [],
    strengths: agent?.strengths ?? [],
    workStyle: agent?.workStyle ?? [],
  };
}
