import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { AgentIdentityRecord, UserProfileRecord } from "@/types";

export interface UserProfileStore {
  profiles: UserProfileRecord[];
  agent: AgentIdentityRecord;
}

export interface UserProfileInteractionContext {
  source?: string;
  channel?: string;
  sessionId?: string;
  signal?: string;
}

export interface UserProfileStorage {
  read(): UserProfileStore;
  write(store: UserProfileStore): void;
  update(
    userId: string,
    mutate: (profile: UserProfileRecord) => void,
    context?: UserProfileInteractionContext,
  ): UserProfileRecord;
  updateAgent(
    mutate: (agent: AgentIdentityRecord) => void,
  ): AgentIdentityRecord;
}

function nowIso(): string {
  return new Date().toISOString();
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function createDefaultRelationship(): NonNullable<
  UserProfileRecord["relationship"]
> {
  return {
    status: "new",
    trust: 0,
    collaboration: 0,
    notes: [],
  };
}

function createDefaultEngagement(): NonNullable<
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

export function normalizeRelationship(
  relationship?: UserProfileRecord["relationship"],
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
  engagement?: UserProfileRecord["engagement"],
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

function hydrateProfile(profile: UserProfileRecord): UserProfileRecord {
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

function cloneProfile(base: UserProfileRecord): UserProfileRecord {
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

function cloneAgent(agent: AgentIdentityRecord): AgentIdentityRecord {
  return {
    ...agent,
    notes: [...agent.notes],
    goals: [...agent.goals],
    strengths: [...agent.strengths],
    workStyle: [...agent.workStyle],
    updatedAt: nowIso(),
  };
}

function recordInteraction(
  profile: UserProfileRecord,
  context?: UserProfileInteractionContext,
): void {
  const engagement = normalizeEngagement(profile.engagement);
  engagement.touches += 1;
  const channel = context?.channel ?? context?.source;
  if (channel) {
    engagement.channels = unique([...engagement.channels, channel]);
  }
  if (context?.source) {
    engagement.sources = unique([...engagement.sources, context.source]);
    profile.lastSource = context.source;
    engagement.lastSource = context.source;
  }
  if (context?.sessionId) {
    engagement.sessionIds = unique([
      ...engagement.sessionIds,
      context.sessionId,
    ]);
  }
  if (context?.signal) {
    engagement.recentSignals = unique([
      ...engagement.recentSignals,
      context.signal,
    ]).slice(-10);
  }
  engagement.lastInteractionAt = nowIso();
  profile.engagement = normalizeEngagement(engagement);
  profile.relationship = normalizeRelationship({
    ...normalizeRelationship(profile.relationship),
    lastInteractionAt: engagement.lastInteractionAt,
    lastSource: engagement.lastSource ?? profile.relationship?.lastSource,
  });
}

export function createUserProfileStorage(filePath: string): UserProfileStorage {
  let storeCache: UserProfileStore | undefined;

  const storage: UserProfileStorage = {
    read() {
      if (storeCache) {
        return storeCache;
      }
      if (!existsSync(filePath)) {
        storeCache = {
          profiles: [],
          agent: createDefaultAgentIdentity(),
        };
        storage.write(storeCache);
        return storeCache;
      }
      const parsed = JSON.parse(
        readFileSync(filePath, "utf8"),
      ) as Partial<UserProfileStore>;
      storeCache = {
        profiles: (parsed.profiles ?? []).map((profile) =>
          hydrateProfile(profile),
        ),
        agent: {
          ...createDefaultAgentIdentity(),
          ...(parsed.agent ?? {}),
          notes: parsed.agent?.notes ?? [],
          goals: parsed.agent?.goals ?? [],
          strengths: parsed.agent?.strengths ?? [],
          workStyle: parsed.agent?.workStyle ?? [],
        },
      };
      return storeCache;
    },

    write(store) {
      storeCache = store;
      writeFileSync(filePath, JSON.stringify(store, null, 2), "utf8");
    },

    update(userId, mutate, context) {
      const store = storage.read();
      const existingIndex = store.profiles.findIndex(
        (profile) => profile.userId === userId,
      );
      const base =
        existingIndex >= 0
          ? store.profiles[existingIndex]
          : createEmptyProfile(userId);
      const next = cloneProfile(base);

      mutate(next);
      recordInteraction(next, context);

      if (existingIndex >= 0) {
        store.profiles[existingIndex] = next;
      } else {
        store.profiles.push(next);
      }
      storage.write(store);
      return next;
    },

    updateAgent(mutate) {
      const store = storage.read();
      const next = cloneAgent(store.agent);
      mutate(next);
      store.agent = next;
      storage.write(store);
      return next;
    },
  };

  return storage;
}
