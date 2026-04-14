import type { AgentIdentityRecord, UserProfileRecord } from "@/types";
import { nowIso } from "../shared";
import { normalizeEngagement, normalizeRelationship } from "./normalization";

export function cloneProfile(base: UserProfileRecord): UserProfileRecord {
  return {
    ...base,
    memoryMode: base.memoryMode ?? "hybrid",
    userMemoryMode: base.userMemoryMode ?? base.memoryMode ?? "hybrid",
    assistantMemoryMode:
      base.assistantMemoryMode ?? base.memoryMode ?? "hybrid",
    dialecticMode: base.dialecticMode ?? "assist",
    preferences: [...base.preferences],
    facts: [...base.facts],
    beliefs: [...(base.beliefs ?? [])],
    beliefSources: [...(base.beliefSources ?? [])],
    notes: [...base.notes],
    aliases: [...(base.aliases ?? [])],
    goals: [...(base.goals ?? [])],
    projectContext: [...(base.projectContext ?? [])],
    constraints: [...(base.constraints ?? [])],
    explicitMemories: [...(base.explicitMemories ?? [])],
    toolPreferences: [...(base.toolPreferences ?? [])],
    workStyle: [...(base.workStyle ?? [])],
    relationship: normalizeRelationship(base.relationship),
    engagement: normalizeEngagement(base.engagement),
    lastSeenAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export function cloneAgent(agent: AgentIdentityRecord): AgentIdentityRecord {
  return {
    ...agent,
    notes: [...agent.notes],
    goals: [...agent.goals],
    strengths: [...agent.strengths],
    workStyle: [...agent.workStyle],
    updatedAt: nowIso(),
  };
}
