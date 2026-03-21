import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AgentIdentityRecord,
  UserProfileBeliefSummary,
  UserProfileEngagementSummary,
  UserProfileRecord,
  UserProfileRelationshipSummary,
  UserProfileSearchHit,
} from "@/types";

interface UserProfileStore {
  profiles: UserProfileRecord[];
  agent: AgentIdentityRecord;
}

type RememberKind =
  | "preference"
  | "fact"
  | "belief"
  | "goal"
  | "context"
  | "constraint"
  | "relationship"
  | "note"
  | "memory";

export interface UserProfileRecallHit {
  kind:
    | "displayName"
    | "preference"
    | "fact"
    | "belief"
    | "goal"
    | "context"
    | "constraint"
    | "relationship"
    | "engagement"
    | "memory"
    | "tool"
    | "workStyle"
    | "alias"
    | "note";
  value: string;
  score: number;
}

export interface UserProfileWorkspaceSummary {
  totalProfiles: number;
  agentName: string;
  recentProfiles: string[];
  totalBeliefs: number;
  activeRelationships: number;
  engagedProfiles: number;
  recentSignals: string[];
}

interface UserProfileInteractionContext {
  source?: string;
  channel?: string;
  sessionId?: string;
  signal?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function matchSingle(
  observation: string,
  expression: RegExp,
): string | undefined {
  return observation.match(expression)?.[1]?.trim();
}

function detectTools(observation: string): string[] {
  const known = [
    "Bun",
    "Docker",
    "Podman",
    "SSH",
    "Lightpanda",
    "Claude",
    "OpenAI",
    "Anthropic",
    "Telegram",
    "Discord",
    "Slack",
    "WhatsApp",
    "Matrix",
    "Signal",
    "Mattermost",
    "Home Assistant",
    "DingTalk",
  ];
  const lower = observation.toLowerCase();
  return known.filter((tool) => lower.includes(tool.toLowerCase()));
}

function createDefaultAgentIdentity(): AgentIdentityRecord {
  return {
    name: "Eliza Agent",
    notes: [],
    goals: [],
    strengths: [],
    workStyle: [],
    updatedAt: nowIso(),
  };
}

function createEmptyProfile(userId: string): UserProfileRecord {
  return {
    userId,
    memoryMode: "hybrid",
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

function normalizeRelationship(
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

function normalizeEngagement(
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

function scoreCadence(touches: number): "low" | "steady" | "high" {
  if (touches >= 15) {
    return "high";
  }
  if (touches >= 4) {
    return "steady";
  }
  return "low";
}

export class UserProfileService {
  private readonly filePath: string;

  constructor(baseDir: string) {
    mkdirSync(baseDir, { recursive: true });
    this.filePath = join(baseDir, "user-profiles.json");
    if (!existsSync(this.filePath)) {
      this.write({
        profiles: [],
        agent: createDefaultAgentIdentity(),
      });
    }
  }

  list(): UserProfileRecord[] {
    return this.read()
      .profiles.slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(userId: string): UserProfileRecord {
    const existing = this.read().profiles.find(
      (profile) => profile.userId === userId,
    );
    return existing ? { ...existing } : createEmptyProfile(userId);
  }

  getAgent(): AgentIdentityRecord {
    return this.read().agent;
  }

  card(userId: string): string {
    return this.renderCards(userId);
  }

  agentProfile(): string {
    return this.renderAgent();
  }

  beliefs(userId: string): UserProfileBeliefSummary {
    const profile = this.get(userId);
    return {
      userId,
      displayName: profile.displayName,
      beliefs: profile.beliefs ?? [],
      sources: profile.beliefSources ?? [],
    };
  }

  relationship(userId: string): UserProfileRelationshipSummary {
    const profile = this.get(userId);
    const relationship = normalizeRelationship(profile.relationship);
    return {
      userId,
      displayName: profile.displayName,
      status: relationship.status,
      trust: relationship.trust,
      collaboration: relationship.collaboration,
      notes: relationship.notes,
      lastInteractionAt: relationship.lastInteractionAt,
      lastSource: relationship.lastSource,
    };
  }

  engagement(userId: string): UserProfileEngagementSummary {
    const profile = this.get(userId);
    const engagement = normalizeEngagement(profile.engagement);
    return {
      userId,
      displayName: profile.displayName,
      touches: engagement.touches,
      channels: engagement.channels,
      sources: engagement.sources,
      sessionIds: engagement.sessionIds,
      recentSignals: engagement.recentSignals,
      lastInteractionAt: engagement.lastInteractionAt,
      lastSource: engagement.lastSource,
    };
  }

  search(query: string, limit = 10): UserProfileSearchHit[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return [];
    }

    const scored = this.list().flatMap((profile) => {
      const matches: string[] = [];
      const fields = [
        ["displayName", profile.displayName],
        ["alias", profile.aliases?.join(" ")],
        ["preference", profile.preferences.join(" ")],
        ["fact", profile.facts.join(" ")],
        ["belief", profile.beliefs.join(" ")],
        ["beliefSource", profile.beliefSources?.join(" ")],
        ["goal", profile.goals?.join(" ")],
        ["context", profile.projectContext?.join(" ")],
        ["constraint", profile.constraints?.join(" ")],
        ["memory", profile.explicitMemories?.join(" ")],
        ["tool", profile.toolPreferences?.join(" ")],
        ["workStyle", profile.workStyle?.join(" ")],
        ["note", profile.notes.join(" ")],
        ["relationship", profile.relationship?.notes?.join(" ")],
        ["engagement", profile.engagement?.recentSignals?.join(" ")],
        ["status", profile.relationship?.status],
      ] as const;

      let score = 0;
      const preview: string[] = [];
      for (const [field, value] of fields) {
        if (!value) {
          continue;
        }
        const lower = value.toLowerCase();
        if (!lower.includes(normalized)) {
          continue;
        }
        matches.push(field);
        score += lower === normalized ? 50 : 10;
        score += lower.startsWith(normalized) ? 8 : 0;
        preview.push(
          `${field}: ${value.length > 120 ? `${value.slice(0, 120)}…` : value}`,
        );
      }

      if (!matches.length) {
        return [];
      }

      return [
        {
          userId: profile.userId,
          displayName: profile.displayName,
          score: score + Math.max(1, 20 - profile.updatedAt.length / 4),
          matchedFields: unique(matches),
          preview: unique(preview).slice(0, 3),
        },
      ];
    });

    return scored
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }

  seedAgent(seed: {
    name?: string;
    goals?: string[];
    strengths?: string[];
    workStyle?: string[];
    notes?: string[];
  }): AgentIdentityRecord {
    return this.updateAgent((agent) => {
      if (seed.name?.trim()) {
        agent.name = seed.name.trim();
      }
      if (seed.goals?.length) {
        agent.goals = unique([...agent.goals, ...seed.goals]);
      }
      if (seed.strengths?.length) {
        agent.strengths = unique([...agent.strengths, ...seed.strengths]);
      }
      if (seed.workStyle?.length) {
        agent.workStyle = unique([...agent.workStyle, ...seed.workStyle]);
      }
      if (seed.notes?.length) {
        agent.notes = unique([...agent.notes, ...seed.notes]);
      }
    });
  }

  setMode(
    userId: string,
    mode: UserProfileRecord["memoryMode"],
    context?: UserProfileInteractionContext,
  ): UserProfileRecord {
    return this.update(
      userId,
      (profile) => {
        profile.memoryMode = mode ?? "hybrid";
      },
      context,
    );
  }

  addNote(
    userId: string,
    note: string,
    source?: string,
    context?: UserProfileInteractionContext,
  ): UserProfileRecord {
    return this.remember(userId, "note", note, source, context);
  }

  remember(
    userId: string,
    kind: RememberKind,
    value: string,
    source?: string,
    context?: UserProfileInteractionContext,
  ): UserProfileRecord {
    const nextValue = value.trim();
    return this.update(
      userId,
      (profile) => {
        switch (kind) {
          case "preference":
            profile.preferences = unique([...profile.preferences, nextValue]);
            break;
          case "fact":
            profile.facts = unique([...profile.facts, nextValue]);
            break;
          case "belief":
            profile.beliefs = unique([...profile.beliefs, nextValue]);
            profile.beliefSources = unique([
              ...(profile.beliefSources ?? []),
              source ?? "manual",
            ]);
            break;
          case "goal":
            profile.goals = unique([...(profile.goals ?? []), nextValue]);
            break;
          case "context":
            profile.projectContext = unique([
              ...(profile.projectContext ?? []),
              nextValue,
            ]);
            break;
          case "constraint":
            profile.constraints = unique([
              ...(profile.constraints ?? []),
              nextValue,
            ]);
            break;
          case "relationship":
            profile.relationship = normalizeRelationship({
              ...normalizeRelationship(profile.relationship),
              notes: unique([
                ...(profile.relationship?.notes ?? []),
                nextValue,
              ]),
              lastSource: source ?? profile.relationship?.lastSource,
              lastInteractionAt: nowIso(),
            });
            break;
          case "memory":
            profile.explicitMemories = unique([
              ...(profile.explicitMemories ?? []),
              nextValue,
            ]);
            break;
          default:
            profile.notes = unique([...profile.notes, nextValue]);
            break;
        }
        profile.lastSource = source ?? profile.lastSource;
      },
      context ?? { source },
    );
  }

  observe(
    userId: string,
    message: string,
    source?: string,
    context?: UserProfileInteractionContext,
  ): UserProfileRecord {
    const observation = message.trim();
    return this.update(
      userId,
      (profile) => {
        const lower = observation.toLowerCase();
        const preference = matchSingle(
          observation,
          /\b(?:i prefer|i like|i usually use)\s+(.+?)(?:[.!?]|$)/iu,
        );
        const belief = matchSingle(
          observation,
          /\b(?:i believe|i think|i suspect|i'm convinced|i expect)\s+(.+?)(?:[.!?]|$)/iu,
        );
        const fact = matchSingle(
          observation,
          /\b(?:my name is|i am|i'm)\s+(.+?)(?:[.!?]|$)/iu,
        );
        const alias = matchSingle(
          observation,
          /\b(?:you can call me|call me|i go by)\s+(.+?)(?:[.!?]|$)/iu,
        );
        const goal = matchSingle(
          observation,
          /\b(?:my goal is|i want to|i need to|help me)\s+(.+?)(?:[.!?]|$)/iu,
        );
        const projectContext = matchSingle(
          observation,
          /\b(?:we are building|we're building|this project is|the current project is)\s+(.+?)(?:[.!?]|$)/iu,
        );
        const constraint = matchSingle(
          observation,
          /\b(?:do not|don't|must not|cannot|can't)\s+(.+?)(?:[.!?]|$)/iu,
        );
        const toolSignals = detectTools(observation);
        const workStyle = matchSingle(
          observation,
          /\b(?:i work best with|i prefer updates that are|i want responses that are)\s+(.+?)(?:[.!?]|$)/iu,
        );

        if (preference && preference.length < 160) {
          profile.preferences = unique([...profile.preferences, preference]);
        }
        if (belief && belief.length < 180) {
          profile.beliefs = unique([...profile.beliefs, belief]);
          profile.beliefSources = unique([
            ...(profile.beliefSources ?? []),
            source ?? "observation",
          ]);
        }
        if (fact && fact.length < 160) {
          if (lower.startsWith("my name is")) {
            profile.displayName = fact.trim();
          } else {
            profile.facts = unique([...profile.facts, fact]);
          }
        }
        if (alias && alias.length < 100) {
          profile.aliases = unique([...(profile.aliases ?? []), alias]);
        }
        if (goal && goal.length < 180) {
          profile.goals = unique([...(profile.goals ?? []), goal]);
        }
        if (projectContext && projectContext.length < 220) {
          profile.projectContext = unique([
            ...(profile.projectContext ?? []),
            projectContext,
          ]);
        }
        if (constraint && constraint.length < 220) {
          profile.constraints = unique([
            ...(profile.constraints ?? []),
            constraint,
          ]);
        }
        if (toolSignals.length) {
          profile.toolPreferences = unique([
            ...(profile.toolPreferences ?? []),
            ...toolSignals,
          ]);
        }
        if (
          /trust|collaborat|team|partner|together|reliable|depend on|count on|follow through/iu.test(
            observation,
          )
        ) {
          const current = normalizeRelationship(profile.relationship);
          current.notes = unique([...(current.notes ?? []), observation]).slice(
            -15,
          );
          current.lastInteractionAt = nowIso();
          current.lastSource = source ?? current.lastSource;
          profile.relationship = normalizeRelationship(current);
        }
        if (workStyle && workStyle.length < 180) {
          profile.workStyle = unique([...(profile.workStyle ?? []), workStyle]);
        }
        if (
          /remember|save this|important|note that|keep in mind/iu.test(
            observation,
          ) &&
          observation.length < 240
        ) {
          profile.explicitMemories = unique([
            ...(profile.explicitMemories ?? []),
            observation,
          ]);
        }

        const relationshipSignals = [
          /trust/i.test(observation),
          /work together|collaborat|team|partner|together/i.test(observation),
          /reliable|depend on|count on|follow through/i.test(observation),
        ].filter(Boolean).length;
        if (relationshipSignals > 0) {
          const current = normalizeRelationship(profile.relationship);
          current.trust = Math.min(
            10,
            current.trust + (relationshipSignals > 1 ? 2 : 1),
          );
          current.collaboration = Math.min(
            10,
            current.collaboration + (relationshipSignals > 1 ? 2 : 1),
          );
          current.notes = unique([...(current.notes ?? []), observation]).slice(
            -15,
          );
          current.lastInteractionAt = nowIso();
          current.lastSource = source ?? current.lastSource;
          profile.relationship = normalizeRelationship(current);
        }

        profile.lastSource = source ?? profile.lastSource;
      },
      context ?? { source, channel: source, signal: observation },
    );
  }

  observeAgent(note: string, source?: string): AgentIdentityRecord {
    const observation = note.trim();
    return this.updateAgent((agent) => {
      const goal = matchSingle(
        observation,
        /\b(?:goal|objective|mission)\s*:\s*(.+)$/iu,
      );
      const strength = matchSingle(
        observation,
        /\b(?:strength|specialty|best at)\s*:\s*(.+)$/iu,
      );
      const workStyle = matchSingle(
        observation,
        /\b(?:style|work style|voice)\s*:\s*(.+)$/iu,
      );

      if (goal) {
        agent.goals = unique([...agent.goals, goal]);
      } else if (strength) {
        agent.strengths = unique([...agent.strengths, strength]);
      } else if (workStyle) {
        agent.workStyle = unique([...agent.workStyle, workStyle]);
      } else {
        agent.notes = unique([...agent.notes, observation]);
      }
      agent.lastSource = source ?? agent.lastSource;
    });
  }

  recall(userId: string, query: string, limit = 8): UserProfileRecallHit[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return [];
    }
    const profile = this.get(userId);
    const candidates: UserProfileRecallHit[] = [];
    const pushMatches = (
      kind: UserProfileRecallHit["kind"],
      values: string[] | undefined,
    ) => {
      for (const value of values ?? []) {
        const lower = value.toLowerCase();
        if (!lower.includes(normalized)) {
          continue;
        }
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

  render(userId: string): string {
    const profile = this.get(userId);
    const relationship = this.relationship(userId);
    const engagement = this.engagement(userId);
    const beliefs = this.beliefs(userId);
    return [
      `USER PROFILE: ${profile.displayName ?? profile.userId}`,
      `Memory mode: ${profile.memoryMode ?? "hybrid"}`,
      `Last seen: ${profile.lastSeenAt}`,
      `Source: ${profile.lastSource ?? "unknown"}`,
      "",
      "Preferences",
      ...(profile.preferences.length
        ? profile.preferences.map((item) => `- ${item}`)
        : ["- (none)"]),
      "",
      "Goals",
      ...((profile.goals ?? []).length
        ? (profile.goals ?? []).map((item) => `- ${item}`)
        : ["- (none)"]),
      "",
      "Beliefs",
      ...(beliefs.beliefs.length
        ? beliefs.beliefs.map(
            (item, index) =>
              `- ${item}${beliefs.sources[index] ? ` [${beliefs.sources[index]}]` : ""}`,
          )
        : ["- (none)"]),
      "",
      "Project Context",
      ...((profile.projectContext ?? []).length
        ? (profile.projectContext ?? []).map((item) => `- ${item}`)
        : ["- (none)"]),
      "",
      "Constraints",
      ...((profile.constraints ?? []).length
        ? (profile.constraints ?? []).map((item) => `- ${item}`)
        : ["- (none)"]),
      "",
      "Tools",
      ...((profile.toolPreferences ?? []).length
        ? (profile.toolPreferences ?? []).map((item) => `- ${item}`)
        : ["- (none)"]),
      "",
      "Work Style",
      ...((profile.workStyle ?? []).length
        ? (profile.workStyle ?? []).map((item) => `- ${item}`)
        : ["- (none)"]),
      "",
      `Relationship: ${relationship.status} trust=${relationship.trust}/10 collaboration=${relationship.collaboration}/10`,
      ...(relationship.notes.length
        ? relationship.notes.slice(-5).map((item) => `- ${item}`)
        : ["- (none)"]),
      "",
      `Engagement: touches=${engagement.touches} cadence=${scoreCadence(engagement.touches)}`,
      `Channels: ${engagement.channels.length ? engagement.channels.join(", ") : "none"}`,
      `Sources: ${engagement.sources.length ? engagement.sources.join(", ") : "none"}`,
      ...(engagement.recentSignals.length
        ? engagement.recentSignals.slice(-5).map((item) => `- ${item}`)
        : ["- (none)"]),
      "",
      "Aliases",
      ...((profile.aliases ?? []).length
        ? (profile.aliases ?? []).map((item) => `- ${item}`)
        : ["- (none)"]),
      "",
      "Facts",
      ...(profile.facts.length
        ? profile.facts.map((item) => `- ${item}`)
        : ["- (none)"]),
      "",
      "Explicit Memories",
      ...((profile.explicitMemories ?? []).length
        ? (profile.explicitMemories ?? []).map((item) => `- ${item}`)
        : ["- (none)"]),
      "",
      "Notes",
      ...(profile.notes.length
        ? profile.notes.map((item) => `- ${item}`)
        : ["- (none)"]),
    ].join("\n");
  }

  renderAgent(): string {
    const agent = this.getAgent();
    return [
      `AGENT PROFILE: ${agent.name}`,
      `Updated: ${agent.updatedAt}`,
      `Source: ${agent.lastSource ?? "unknown"}`,
      "",
      "Goals",
      ...(agent.goals.length
        ? agent.goals.map((item) => `- ${item}`)
        : ["- (none)"]),
      "",
      "Strengths",
      ...(agent.strengths.length
        ? agent.strengths.map((item) => `- ${item}`)
        : ["- (none)"]),
      "",
      "Work Style",
      ...(agent.workStyle.length
        ? agent.workStyle.map((item) => `- ${item}`)
        : ["- (none)"]),
      "",
      "Notes",
      ...(agent.notes.length
        ? agent.notes.map((item) => `- ${item}`)
        : ["- (none)"]),
    ].join("\n");
  }

  renderCards(userId: string): string {
    return `${this.render(userId)}\n\n${this.renderAgent()}`;
  }

  summary(): UserProfileWorkspaceSummary {
    const profiles = this.list();
    const agent = this.getAgent();
    const totalBeliefs = profiles.reduce(
      (sum, profile) => sum + (profile.beliefs?.length ?? 0),
      0,
    );
    const activeRelationships = profiles.filter((profile) => {
      const relationship = normalizeRelationship(profile.relationship);
      return relationship.status !== "new";
    }).length;
    const engagedProfiles = profiles.filter(
      (profile) => normalizeEngagement(profile.engagement).touches > 0,
    ).length;
    const recentSignals = unique(
      profiles.flatMap((profile) =>
        normalizeEngagement(profile.engagement).recentSignals.slice(-2),
      ),
    ).slice(-5);
    return {
      totalProfiles: profiles.length,
      agentName: agent.name,
      recentProfiles: profiles.slice(0, 5).map((profile) => profile.userId),
      totalBeliefs,
      activeRelationships,
      engagedProfiles,
      recentSignals,
    };
  }

  private update(
    userId: string,
    mutate: (profile: UserProfileRecord) => void,
    context?: UserProfileInteractionContext,
  ): UserProfileRecord {
    const store = this.read();
    const existingIndex = store.profiles.findIndex(
      (profile) => profile.userId === userId,
    );
    const base =
      existingIndex >= 0
        ? store.profiles[existingIndex]
        : createEmptyProfile(userId);

    const next: UserProfileRecord = {
      ...base,
      memoryMode: base.memoryMode ?? "hybrid",
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

    mutate(next);
    this.recordInteraction(next, context);

    if (existingIndex >= 0) {
      store.profiles[existingIndex] = next;
    } else {
      store.profiles.push(next);
    }
    this.write(store);
    return next;
  }

  private updateAgent(
    mutate: (agent: AgentIdentityRecord) => void,
  ): AgentIdentityRecord {
    const store = this.read();
    const next: AgentIdentityRecord = {
      ...store.agent,
      notes: [...store.agent.notes],
      goals: [...store.agent.goals],
      strengths: [...store.agent.strengths],
      workStyle: [...store.agent.workStyle],
      updatedAt: nowIso(),
    };
    mutate(next);
    store.agent = next;
    this.write(store);
    return next;
  }

  private read(): UserProfileStore {
    const parsed = JSON.parse(
      readFileSync(this.filePath, "utf8"),
    ) as Partial<UserProfileStore>;
    return {
      profiles: (parsed.profiles ?? []).map((profile) => ({
        ...createEmptyProfile(profile.userId),
        ...profile,
        memoryMode: profile.memoryMode ?? "hybrid",
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
      })),
      agent: {
        ...createDefaultAgentIdentity(),
        ...(parsed.agent ?? {}),
        notes: parsed.agent?.notes ?? [],
        goals: parsed.agent?.goals ?? [],
        strengths: parsed.agent?.strengths ?? [],
        workStyle: parsed.agent?.workStyle ?? [],
      },
    };
  }

  private write(store: UserProfileStore): void {
    writeFileSync(this.filePath, JSON.stringify(store, null, 2), "utf8");
  }

  private recordInteraction(
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
}
