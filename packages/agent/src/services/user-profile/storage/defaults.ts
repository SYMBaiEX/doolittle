import type { AgentIdentityRecord, UserProfileRecord } from "@/types";
import { nowIso } from "../shared";

export function createDefaultRelationship(): NonNullable<
  UserProfileRecord["relationship"]
> {
  return {
    status: "new",
    trust: 0,
    collaboration: 0,
    notes: [],
  };
}

export function createDefaultEngagement(): NonNullable<
  UserProfileRecord["engagement"]
> {
  return {
    touches: 0,
    channels: [],
    sources: [],
    sessionIds: [],
    recentSignals: [],
  };
}

export function createDefaultAgentIdentity(): AgentIdentityRecord {
  return {
    name: "Doolittle",
    notes: [],
    goals: [],
    strengths: [],
    workStyle: [],
    updatedAt: nowIso(),
  };
}

export function createEmptyProfile(userId: string): UserProfileRecord {
  return {
    userId,
    memoryMode: "hybrid",
    userMemoryMode: "hybrid",
    assistantMemoryMode: "hybrid",
    dialecticMode: "assist",
    preferences: [],
    facts: [],
    beliefs: [],
    beliefSources: [],
    notes: [],
    aliases: [],
    goals: [],
    projectContext: [],
    constraints: [],
    explicitMemories: [],
    toolPreferences: [],
    workStyle: [],
    relationship: createDefaultRelationship(),
    engagement: createDefaultEngagement(),
    lastSeenAt: nowIso(),
    updatedAt: nowIso(),
  };
}
