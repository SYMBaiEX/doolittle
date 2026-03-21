import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentIdentityRecord, UserProfileRecord } from "@/types";

interface UserProfileStore {
  profiles: UserProfileRecord[];
  agent: AgentIdentityRecord;
}

type RememberKind =
  | "preference"
  | "fact"
  | "goal"
  | "context"
  | "constraint"
  | "note"
  | "memory";

export interface UserProfileRecallHit {
  kind:
    | "displayName"
    | "preference"
    | "fact"
    | "goal"
    | "context"
    | "constraint"
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
    notes: [],
    aliases: [],
    goals: [],
    projectContext: [],
    constraints: [],
    explicitMemories: [],
    toolPreferences: [],
    workStyle: [],
    lastSeenAt: nowIso(),
    updatedAt: nowIso(),
  };
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
  ): UserProfileRecord {
    return this.update(userId, (profile) => {
      profile.memoryMode = mode ?? "hybrid";
    });
  }

  addNote(userId: string, note: string, source?: string): UserProfileRecord {
    return this.remember(userId, "note", note, source);
  }

  remember(
    userId: string,
    kind: RememberKind,
    value: string,
    source?: string,
  ): UserProfileRecord {
    const nextValue = value.trim();
    return this.update(userId, (profile) => {
      switch (kind) {
        case "preference":
          profile.preferences = unique([...profile.preferences, nextValue]);
          break;
        case "fact":
          profile.facts = unique([...profile.facts, nextValue]);
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
    });
  }

  observe(userId: string, message: string, source?: string): UserProfileRecord {
    const observation = message.trim();
    return this.update(userId, (profile) => {
      const lower = observation.toLowerCase();
      const preference = matchSingle(
        observation,
        /\b(?:i prefer|i like|i usually use)\s+(.+?)(?:[.!?]|$)/iu,
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

      profile.lastSource = source ?? profile.lastSource;
    });
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

    return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  render(userId: string): string {
    const profile = this.get(userId);
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
    return {
      totalProfiles: profiles.length,
      agentName: agent.name,
      recentProfiles: profiles.slice(0, 5).map((profile) => profile.userId),
    };
  }

  private update(
    userId: string,
    mutate: (profile: UserProfileRecord) => void,
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
      notes: [...base.notes],
      aliases: [...(base.aliases ?? [])],
      goals: [...(base.goals ?? [])],
      projectContext: [...(base.projectContext ?? [])],
      constraints: [...(base.constraints ?? [])],
      explicitMemories: [...(base.explicitMemories ?? [])],
      toolPreferences: [...(base.toolPreferences ?? [])],
      workStyle: [...(base.workStyle ?? [])],
      lastSeenAt: nowIso(),
      updatedAt: nowIso(),
    };

    mutate(next);

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
}
